import type { Octokit } from 'octokit';
import {
	isParsedBlockConfig,
	isParsedContentConfig,
	parseConfigFile,
	type ParsedBlockConfig,
	type ParsedContentConfig
} from '$lib/config/parse';
import { analyzeItemLabelSchemaUnit } from '$lib/features/content-management/item-labels';
import { normalizeRuntimeDiscoveredConfigIdentity } from '$lib/features/content-management/stable-identity';
import { parseRootConfig } from '$lib/config/root-config';
import type { RootConfig } from '$lib/config/root-config';
import type { BlockUsage } from '$lib/config/types';
import { slugify } from '$lib/utils';

export interface DiscoveryIssue {
	code: string;
	message: string;
	severity: 'warning' | 'error';
	category: 'compatibility' | 'structural' | 'runtime' | 'ambiguity';
	path?: string;
	blockId?: string;
	binding?: string;
}

export interface DiscoveredConfig {
	path: string;
	slug: string;
	config: ParsedContentConfig;
	issues?: DiscoveryIssue[];
}

export interface DiscoveredBlockConfig {
	path: string;
	id: string;
	config: ParsedBlockConfig;
	issues?: DiscoveryIssue[];
}

function getReferenceBindings(value: unknown): string[] {
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized.length > 0 ? [normalized] : [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((entry) => {
			if (typeof entry !== 'string') {
				return [];
			}

			const normalized = entry.trim();
			return normalized.length > 0 ? [normalized] : [];
		});
	}

	return [];
}

function isQualifiedReferenceBinding(binding: string): boolean {
	return binding.includes(':');
}

function walkBlocks(blocks: BlockUsage[], visit: (block: BlockUsage, structured: boolean) => void): void {
	for (const block of blocks) {
		const structured = Array.isArray((block as { blocks?: BlockUsage[] }).blocks);
		visit(block, structured);

		if (structured) {
			walkBlocks((block as { blocks: BlockUsage[] }).blocks, visit);
		}
	}
}

function collectConfigCompatibilityIssues(
	path: string,
	blocks: BlockUsage[]
): DiscoveryIssue[] {
	const issues: DiscoveryIssue[] = [];

	walkBlocks(blocks, (block, structured) => {
		for (const binding of getReferenceBindings(block.referenceFor)) {
			if (structured && isQualifiedReferenceBinding(binding)) {
				issues.push({
					code: 'content-components.reference-binding.selector-on-structured',
					message: `Block "${block.id}" uses selector referenceFor "${binding}" on a structured source. Use an unqualified marker-only binding like "${binding.split(':', 1)[0]}" instead.`,
					severity: 'warning',
					category: 'compatibility',
					path,
					blockId: block.id,
					binding
				});
				continue;
			}

			if (!structured && !isQualifiedReferenceBinding(binding)) {
				issues.push({
					code: 'content-components.reference-binding.marker-on-primitive',
					message: `Block "${block.id}" uses marker-only referenceFor "${binding}" on a primitive field. Marker-only bindings require a structured block source.`,
					severity: 'warning',
					category: 'compatibility',
					path,
					blockId: block.id,
					binding
				});
			}
		}
	});

	return issues;
}

function collectItemLabelIssues(
	path: string,
	blocks: BlockUsage[],
	unitLabel: string
): DiscoveryIssue[] {
	const analysis = analyzeItemLabelSchemaUnit(blocks);
	const issues: DiscoveryIssue[] = analysis.issues.map((issue) => ({
		code: issue.code,
		message: `${unitLabel}: ${issue.message}`,
		severity: 'warning' as const,
		category: 'structural' as const,
		path,
		blockId: issue.blockId
	}));

	for (const block of blocks) {
		if (block.type !== 'block' || !block.blocks) {
			continue;
		}

		issues.push(
			...collectItemLabelIssues(
				path,
				block.blocks,
				`${unitLabel} > inline block "${block.id}"`
			)
		);
	}

	return issues;
}

function normalizeDir(dir: string | undefined): string | undefined {
	if (!dir) {
		return undefined;
	}

	return dir.replace(/^\.\//, '').replace(/\/+$/, '');
}

function isWithinDir(path: string, dir: string): boolean {
	return path === dir || path.startsWith(`${dir}/`);
}

export function getDiscoverableContentConfigPaths(
	paths: string[],
	rootConfig: RootConfig | null
): string[] {
	const configsDir = normalizeDir(rootConfig?.configsDir);
	const blocksDir = normalizeDir(rootConfig?.blocksDir);

	return paths.filter((path) => {
		if (!path.endsWith('.tentman.json')) {
			return false;
		}

		const filename = path.split('/').pop();
		if (filename?.startsWith('_')) {
			return false;
		}

		if (blocksDir && isWithinDir(path, blocksDir)) {
			return false;
		}

		if (configsDir) {
			return isWithinDir(path, configsDir);
		}

		return true;
	});
}

export function getDiscoverableBlockConfigPaths(
	paths: string[],
	rootConfig: RootConfig | null
): string[] {
	const blocksDir = normalizeDir(rootConfig?.blocksDir);

	if (!blocksDir) {
		return [];
	}

	return paths.filter((path) => {
		if (!path.endsWith('.tentman.json')) {
			return false;
		}

		return isWithinDir(path, blocksDir);
	});
}

/**
 * Shared parser for config files discovered by any backend.
 */
export function parseDiscoveredConfig(path: string, content: string): DiscoveredConfig {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error(`Expected a content config at ${path}`);
	}

	return {
		path,
		slug: slugify(parsed.label),
		config: parsed,
		issues: [
			...collectConfigCompatibilityIssues(path, parsed.blocks),
			...collectItemLabelIssues(path, parsed.blocks, `Config at ${path}`)
		]
	};
}

export function parseDiscoveredBlockConfig(path: string, content: string): DiscoveredBlockConfig {
	const parsed = parseConfigFile(content);

	if (!isParsedBlockConfig(parsed)) {
		throw new Error(`Expected a block config at ${path}`);
	}

	return {
		path,
		id: parsed.id,
		config: parsed,
		issues: [
			...collectConfigCompatibilityIssues(path, parsed.blocks),
			...collectItemLabelIssues(path, parsed.blocks, `Reusable block config at ${path}`)
		]
	};
}

async function readGitHubRootConfig(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref?: string
): Promise<RootConfig | null> {
	try {
		const { data } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: 'tentman.json',
			...(ref ? { ref } : {})
		});

		if (!('content' in data) || Array.isArray(data)) {
			return null;
		}

		return parseRootConfig(Buffer.from(data.content, 'base64').toString('utf-8'));
	} catch {
		return null;
	}
}

/**
 * Discovers all *.tentman.json files in a GitHub repository using the Git Trees API.
 */
export async function discoverGitHubConfigs(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref?: string
): Promise<DiscoveredConfig[]> {
	try {
		const rootConfig = await readGitHubRootConfig(octokit, owner, repo, ref);
		const treeRef =
			ref ??
			(
				await octokit.rest.repos.get({
					owner,
					repo
				})
			).data.default_branch;

		// Get the tree recursively
		const { data: treeData } = await octokit.rest.git.getTree({
			owner,
			repo,
			tree_sha: treeRef,
			recursive: 'true'
		});

		const configPaths = getDiscoverableContentConfigPaths(
			treeData.tree
				.filter((item) => {
					return item.type === 'blob' && !!item.path;
				})
				.map((item) => item.path!),
			rootConfig
		);

		// Fetch and parse each config file
		const configs = await Promise.all(
			configPaths.map(async (path) => {
				try {
					const { data: fileData } = await octokit.rest.repos.getContent({
						owner,
						repo,
						path,
						...(ref ? { ref } : {})
					});

					// Decode base64 content
					if ('content' in fileData && fileData.content) {
						const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
						return parseDiscoveredConfig(path, content);
					}

					return null;
				} catch (err) {
					console.error(`Failed to fetch/parse config at ${path}:`, err);
					return null;
				}
			})
		);

		return normalizeRuntimeDiscoveredConfigIdentity(
			configs.filter((c): c is DiscoveredConfig => c !== null),
			rootConfig
		);
	} catch (err) {
		console.error('Failed to discover configs:', err);
		throw new Error('Failed to discover configuration files in repository');
	}
}

export async function discoverGitHubBlockConfigs(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref?: string
): Promise<DiscoveredBlockConfig[]> {
	try {
		const rootConfig = await readGitHubRootConfig(octokit, owner, repo, ref);
		const treeRef =
			ref ??
			(
				await octokit.rest.repos.get({
					owner,
					repo
				})
			).data.default_branch;

		const { data: treeData } = await octokit.rest.git.getTree({
			owner,
			repo,
			tree_sha: treeRef,
			recursive: 'true'
		});

		const blockPaths = getDiscoverableBlockConfigPaths(
			treeData.tree
				.filter((item) => {
					return item.type === 'blob' && !!item.path;
				})
				.map((item) => item.path!),
			rootConfig
		);

		const configs = await Promise.all(
			blockPaths.map(async (path) => {
				try {
					const { data: fileData } = await octokit.rest.repos.getContent({
						owner,
						repo,
						path,
						...(ref ? { ref } : {})
					});

					if ('content' in fileData && fileData.content) {
						const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
						return parseDiscoveredBlockConfig(path, content);
					}

					return null;
				} catch (err) {
					console.error(`Failed to fetch/parse block config at ${path}:`, err);
					return null;
				}
			})
		);

		return configs.filter((c): c is DiscoveredBlockConfig => c !== null);
	} catch (err) {
		console.error('Failed to discover block configs:', err);
		throw new Error('Failed to discover block configuration files in repository');
	}
}
