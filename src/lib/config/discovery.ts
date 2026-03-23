import type { Octokit } from 'octokit';
import {
	isParsedBlockConfig,
	isParsedContentConfig,
	parseConfigFile,
	type ParsedBlockConfig,
	type ParsedContentConfig
} from '$lib/config/parse';
import { parseRootConfig } from '$lib/config/root-config';
import type { RootConfig } from '$lib/config/root-config';
import { slugify } from '$lib/utils';

export interface DiscoveredConfig {
	path: string;
	slug: string;
	config: ParsedContentConfig;
}

export interface DiscoveredBlockConfig {
	path: string;
	id: string;
	config: ParsedBlockConfig;
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
		if (path === '.tentman.json') {
			return false;
		}

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
		if (path === '.tentman.json') {
			return false;
		}

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
		config: parsed
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
		config: parsed
	};
}

async function readGitHubRootConfig(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<RootConfig | null> {
	try {
		const { data } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: '.tentman.json'
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
	repo: string
): Promise<DiscoveredConfig[]> {
	try {
		const rootConfig = await readGitHubRootConfig(octokit, owner, repo);

		// Get the default branch
		const { data: repoData } = await octokit.rest.repos.get({
			owner,
			repo
		});
		const defaultBranch = repoData.default_branch;

		// Get the tree recursively
		const { data: treeData } = await octokit.rest.git.getTree({
			owner,
			repo,
			tree_sha: defaultBranch,
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
						path
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

		// Filter out nulls and return
		return configs.filter((c): c is DiscoveredConfig => c !== null);
	} catch (err) {
		console.error('Failed to discover configs:', err);
		throw new Error('Failed to discover configuration files in repository');
	}
}

export async function discoverGitHubBlockConfigs(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<DiscoveredBlockConfig[]> {
	try {
		const rootConfig = await readGitHubRootConfig(octokit, owner, repo);

		const { data: repoData } = await octokit.rest.repos.get({
			owner,
			repo
		});
		const defaultBranch = repoData.default_branch;

		const { data: treeData } = await octokit.rest.git.getTree({
			owner,
			repo,
			tree_sha: defaultBranch,
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
						path
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
