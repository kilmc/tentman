import type { Octokit } from 'octokit';
import type { DiscoveredConfig } from '$lib/config/discovery';
import type { ParsedContentConfig } from '$lib/config/parse';
import type { DraftMetadata } from '$lib/utils/draft-comparison';
import { resolveConfigPath } from '$lib/utils/validation';
import { traceGitHubRequest } from '$lib/utils/workflow-instrumentation';
import {
	getChangedFilePaths,
	getDirectoryContentTarget,
	getDirectoryItemIdFromPath,
	isRelevantDirectoryContentChange
} from './path-classification';
import type { ConfigDraftChangeScope, DraftChangedFile, DraftChangeIndex } from './types';

type DirectoryBackedConfig = ParsedContentConfig & {
	content: { mode: 'directory'; path: string; template: string; filename?: string };
};

interface DraftChangeIndexInput {
	octokit: Octokit;
	owner: string;
	repo: string;
	baseBranch: string;
	draftBranch: string;
	configs: DiscoveredConfig[];
}

interface CachedDraftChangeIndex {
	value: DraftChangeIndex;
	timestamp: number;
}

const DRAFT_CHANGE_INDEX_TTL = 60 * 1000;
const draftChangeIndexCache = new Map<string, CachedDraftChangeIndex>();
const draftChangeIndexInflight = new Map<string, Promise<DraftChangeIndex>>();

function getDraftChangeIndexCacheKey(input: DraftChangeIndexInput): string {
	const configIdentity = input.configs
		.map((config) => `${config.slug}:${config.path}`)
		.sort()
		.join(',');
	return `${input.owner}/${input.repo}:${input.baseBranch}:${input.draftBranch}:${configIdentity}`;
}

function isFreshDraftChangeIndex(
	entry: CachedDraftChangeIndex | undefined
): entry is CachedDraftChangeIndex {
	return entry !== undefined && Date.now() - entry.timestamp < DRAFT_CHANGE_INDEX_TTL;
}

async function listChangedFilesBetweenRefs(
	input: DraftChangeIndexInput
): Promise<{ files: DraftChangedFile[]; mergeBaseCommit?: string }> {
	const files: DraftChangedFile[] = [];
	let page = 1;
	let mergeBaseCommit: string | undefined;

	while (true) {
		const response = await traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'listChangedFilesBetweenRefs',
				requestKind: 'compare',
				repoKey: `github:${input.owner}/${input.repo}`,
				owner: input.owner,
				repo: input.repo,
				ref: input.draftBranch,
				path: `${input.baseBranch}...${input.draftBranch}`
			},
			() =>
				input.octokit.rest.repos.compareCommits({
					owner: input.owner,
					repo: input.repo,
					base: input.baseBranch,
					head: input.draftBranch,
					per_page: 100,
					page
				})
		);

		if (!mergeBaseCommit) {
			mergeBaseCommit = response.data.merge_base_commit?.sha;
		}

		for (const file of response.data.files ?? []) {
			files.push({
				filename: file.filename,
				status: file.status,
				...(file.previous_filename ? { previous_filename: file.previous_filename } : {})
			});
		}

		if ((response.data.files?.length ?? 0) < 100) {
			break;
		}

		page += 1;
	}

	return { files, mergeBaseCommit };
}

async function getDraftMetadata(
	input: DraftChangeIndexInput,
	mergeBaseCommit?: string
): Promise<DraftMetadata> {
	const [draftBranch, baseBranch] = await Promise.all([
		traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'getDraftMetadataDraftBranch',
				requestKind: 'branch',
				repoKey: `github:${input.owner}/${input.repo}`,
				owner: input.owner,
				repo: input.repo,
				ref: input.draftBranch
			},
			() =>
				input.octokit.rest.repos.getBranch({
					owner: input.owner,
					repo: input.repo,
					branch: input.draftBranch
				})
		),
		traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'getDraftMetadataBaseBranch',
				requestKind: 'branch',
				repoKey: `github:${input.owner}/${input.repo}`,
				owner: input.owner,
				repo: input.repo,
				ref: input.baseBranch
			},
			() =>
				input.octokit.rest.repos.getBranch({
					owner: input.owner,
					repo: input.repo,
					branch: input.baseBranch
				})
		)
	]);
	const lastCommitDateValue = draftBranch.data.commit.commit.committer?.date;
	const lastCommitDate = lastCommitDateValue ? new Date(lastCommitDateValue) : undefined;
	const staleThreshold = new Date();
	staleThreshold.setDate(staleThreshold.getDate() - 7);
	const mainHeadCommit = baseBranch.data.commit.sha;

	return {
		branchExists: true,
		...(lastCommitDate ? { lastCommitDate, isStale: lastCommitDate < staleThreshold } : {}),
		hasConflicts: Boolean(mergeBaseCommit && mergeBaseCommit !== mainHeadCommit),
		...(mergeBaseCommit ? { draftBaseCommit: mergeBaseCommit } : {}),
		mainHeadCommit
	};
}

function getEmptyScope(slug: string): ConfigDraftChangeScope {
	return {
		slug,
		modified: [],
		created: [],
		deleted: [],
		requiresFullFetch: false
	};
}

function classifyFileBackedChanges(
	config: ParsedContentConfig,
	configPath: string,
	files: DraftChangedFile[],
	slug: string
): ConfigDraftChangeScope {
	const filePath = resolveConfigPath(configPath, config.content.path);
	const relevantFileChanged = files.some((file) => getChangedFilePaths(file).includes(filePath));

	if (!relevantFileChanged) {
		return getEmptyScope(slug);
	}

	if (config.collection) {
		return {
			...getEmptyScope(slug),
			requiresFullFetch: true
		};
	}

	return {
		...getEmptyScope(slug),
		modified: ['_singleton']
	};
}

function classifyDirectoryChanges(
	config: DirectoryBackedConfig,
	configPath: string,
	files: DraftChangedFile[],
	slug: string
): ConfigDraftChangeScope {
	const target = getDirectoryContentTarget(config, configPath);
	const relevantFiles = files.filter((file) => isRelevantDirectoryContentChange(file, target));
	const scope = getEmptyScope(slug);

	for (const file of relevantFiles) {
		const itemId = getDirectoryItemIdFromPath(file.filename);
		if (!itemId) {
			scope.requiresFullFetch = true;
			continue;
		}

		switch (file.status) {
			case 'added':
				scope.created.push(itemId);
				break;
			case 'removed':
				scope.deleted.push(itemId);
				break;
			case 'modified':
			case 'changed':
				scope.modified.push(itemId);
				break;
			default:
				scope.requiresFullFetch = true;
				break;
		}
	}

	return scope;
}

function classifyConfigChanges(
	config: DiscoveredConfig,
	files: DraftChangedFile[]
): ConfigDraftChangeScope {
	if (config.config.content.mode === 'file') {
		return classifyFileBackedChanges(config.config, config.path, files, config.slug);
	}

	return classifyDirectoryChanges(
		config.config as DirectoryBackedConfig,
		config.path,
		files,
		config.slug
	);
}

function buildDraftChangeIndex(
	input: DraftChangeIndexInput,
	files: DraftChangedFile[],
	metadata: DraftMetadata
): DraftChangeIndex {
	const byConfigSlug = new Map(
		input.configs.map((config) => [config.slug, classifyConfigChanges(config, files)] as const)
	);

	return {
		owner: input.owner,
		repo: input.repo,
		baseBranch: input.baseBranch,
		draftBranch: input.draftBranch,
		metadata,
		files,
		byConfigSlug
	};
}

async function loadDraftChangeIndex(input: DraftChangeIndexInput): Promise<DraftChangeIndex> {
	try {
		const { files, mergeBaseCommit } = await listChangedFilesBetweenRefs(input);
		const metadata = await getDraftMetadata(input, mergeBaseCommit);
		return buildDraftChangeIndex(input, files, metadata);
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
			return buildDraftChangeIndex(input, [], { branchExists: false });
		}

		throw error;
	}
}

export async function getDraftChangeIndex(input: DraftChangeIndexInput): Promise<DraftChangeIndex> {
	const cacheKey = getDraftChangeIndexCacheKey(input);
	const cached = draftChangeIndexCache.get(cacheKey);
	if (isFreshDraftChangeIndex(cached)) {
		return cached.value;
	}

	const pending = draftChangeIndexInflight.get(cacheKey);
	if (pending) {
		return pending;
	}

	const promise = loadDraftChangeIndex(input)
		.then((value) => {
			draftChangeIndexCache.set(cacheKey, {
				value,
				timestamp: Date.now()
			});
			return value;
		})
		.finally(() => {
			draftChangeIndexInflight.delete(cacheKey);
		});
	draftChangeIndexInflight.set(cacheKey, promise);
	return promise;
}

export function clearDraftChangeIndexCache(): void {
	draftChangeIndexCache.clear();
	draftChangeIndexInflight.clear();
}
