/**
 * Draft Comparison Utility
 *
 * Compares content between main and draft branches to identify changes.
 */

import type { Octokit } from 'octokit';
import type { ParsedContentConfig } from '$lib/config/parse';
import { fetchContentDocument } from '$lib/content/service';
import { resolveConfigPath } from '$lib/utils/validation';
import { getItemId, getItemRoute } from '$lib/features/content-management/item';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import { createGitHubRepositoryBackend } from '$lib/repository/github';

const DRAFT_COMPARISON_CONTEXT_TTL = 60 * 1000;

export interface DraftChange {
	itemId: string;
	mainContent?: ContentRecord;
	draftContent?: ContentRecord;
}

export interface DraftComparison {
	modified: DraftChange[];
	created: DraftChange[];
	deleted: DraftChange[];
	metadata?: DraftMetadata;
}

export interface DraftMetadata {
	branchExists: boolean;
	lastCommitDate?: Date;
	isStale?: boolean; // 7+ days old
	hasConflicts?: boolean; // main has advanced since draft was created
	draftBaseCommit?: string; // SHA of commit where draft branched from main
	mainHeadCommit?: string; // Current SHA of main branch
}

interface DraftBranchChangedFile {
	filename: string;
	status: string;
	previous_filename?: string;
}

interface DraftComparisonContext {
	metadata: DraftMetadata;
	changedFiles: DraftBranchChangedFile[];
	canUseCheapComparison: boolean;
}

interface CachedDraftComparisonContext {
	value: DraftComparisonContext;
	timestamp: number;
}

const draftComparisonContextCache = new Map<string, CachedDraftComparisonContext>();
const draftComparisonContextInflight = new Map<string, Promise<DraftComparisonContext>>();

export function clearDraftComparisonContextCache(): void {
	draftComparisonContextCache.clear();
	draftComparisonContextInflight.clear();
}

/**
 * Compare content between main and draft branches
 *
 * @param octokit - GitHub API client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param config - Content configuration
 * @param configPath - Path to config file
 * @param draftBranch - Name of the draft branch
 * @returns Comparison result showing modified, created, and deleted items
 */
export async function compareDraftToBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: ParsedContentConfig,
	configPath: string,
	draftBranch: string
): Promise<DraftComparison> {
	try {
		const comparisonContext = await getDraftComparisonContext(
			octokit,
			owner,
			repo,
			draftBranch
		);
		const { metadata } = comparisonContext;

		if (!metadata.branchExists) {
			console.log(
				`[DRAFT COMPARISON] Branch ${draftBranch} does not exist, returning empty comparison`
			);
			return { ...emptyComparison(), metadata };
		}

		if (comparisonContext.canUseCheapComparison) {
			const cheapComparison = buildCheapDraftComparison(
				config,
				configPath,
				comparisonContext.changedFiles
			);

			if (cheapComparison && !cheapComparison.requiresFullFetch) {
				return {
					...cheapComparison.comparison,
					metadata
				};
			}
		}

		const backend = createGitHubRepositoryBackend(octokit, {
			owner,
			name: repo,
			full_name: `${owner}/${repo}`
		});

		// Fetch content from both branches
		const [mainContent, draftContent] = await Promise.all([
			fetchContentDocument(backend, config, configPath, { branch: 'main' }),
			fetchContentDocument(backend, config, configPath, { branch: draftBranch })
		]);

		const comparison = compareLoadedDraftContent(config, mainContent, draftContent);
		comparison.metadata = metadata;
		return comparison;
	} catch (error) {
		console.error(`[DRAFT COMPARISON] Failed to compare draft:`, error);
		// Gracefully degrade - return empty comparison
		return emptyComparison();
	}
}

function getDraftComparisonContextCacheKey(owner: string, repo: string, draftBranch: string): string {
	return `${owner}/${repo}:${draftBranch}`;
}

function isFreshDraftComparisonContext(
	entry: CachedDraftComparisonContext | undefined
): entry is CachedDraftComparisonContext {
	return Boolean(entry) && Date.now() - entry.timestamp < DRAFT_COMPARISON_CONTEXT_TTL;
}

async function getDraftComparisonContext(
	octokit: Octokit,
	owner: string,
	repo: string,
	draftBranch: string
): Promise<DraftComparisonContext> {
	const cacheKey = getDraftComparisonContextCacheKey(owner, repo, draftBranch);
	const cachedEntry = draftComparisonContextCache.get(cacheKey);
	if (isFreshDraftComparisonContext(cachedEntry)) {
		return cachedEntry.value;
	}

	const pending = draftComparisonContextInflight.get(cacheKey);
	if (pending) {
		return pending;
	}

	const fetchPromise = loadDraftComparisonContext(octokit, owner, repo, draftBranch)
		.then((value) => {
			draftComparisonContextCache.set(cacheKey, {
				value,
				timestamp: Date.now()
			});
			return value;
		})
		.finally(() => {
			draftComparisonContextInflight.delete(cacheKey);
		});

	draftComparisonContextInflight.set(cacheKey, fetchPromise);
	return fetchPromise;
}

export function compareLoadedDraftContent(
	config: ParsedContentConfig,
	mainContent: ContentDocument,
	draftContent: ContentDocument
): DraftComparison {
	if (!config.collection) {
		return compareSingleton(mainContent as ContentRecord, draftContent as ContentRecord);
	}

	if (!Array.isArray(mainContent) || !Array.isArray(draftContent)) {
		throw new Error('Expected array content for collection draft comparison');
	}

	return compareItemCollections(config, mainContent, draftContent);
}

/**
 * Get metadata about the draft branch including staleness and conflict detection
 */
async function loadDraftComparisonContext(
	octokit: Octokit,
	owner: string,
	repo: string,
	draftBranch: string
): Promise<DraftComparisonContext> {
	try {
		const branchData = await octokit.rest.repos.getBranch({
			owner,
			repo,
			branch: draftBranch
		});

		const draftCommitSha = branchData.data.commit.sha;
		const committerDate = branchData.data.commit.commit.committer?.date;

		if (!committerDate) {
			// Can't determine commit date, return minimal metadata
			return { branchExists: true };
		}

		const lastCommitDate = new Date(committerDate);

		// Check if draft is stale (7+ days old)
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
		const isStale = lastCommitDate < sevenDaysAgo;

		// Get main branch info
		const mainBranch = await octokit.rest.repos.getBranch({
			owner,
			repo,
			branch: 'main'
		});
		const mainHeadCommit = mainBranch.data.commit.sha;
		const { files, mergeBaseCommit } = await listChangedFilesBetweenRefs(
			octokit,
			owner,
			repo,
			'main',
			draftBranch
		);
		const draftBaseCommit = mergeBaseCommit;
		const hasConflicts = Boolean(draftBaseCommit && draftBaseCommit !== mainHeadCommit);

		return {
			metadata: {
				branchExists: true,
				lastCommitDate,
				isStale,
				hasConflicts,
				draftBaseCommit,
				mainHeadCommit
			},
			changedFiles: files,
			canUseCheapComparison: true
		};
	} catch (error: any) {
		if (error.status === 404) {
			return {
				metadata: { branchExists: false },
				changedFiles: [],
				canUseCheapComparison: true
			};
		}
		console.error('[DRAFT METADATA] Error getting branch metadata:', error);
		return {
			metadata: { branchExists: true },
			changedFiles: [],
			canUseCheapComparison: false
		};
	}
}

async function listChangedFilesBetweenRefs(
	octokit: Octokit,
	owner: string,
	repo: string,
	base: string,
	head: string
): Promise<{ files: DraftBranchChangedFile[]; mergeBaseCommit?: string }> {
	const files: DraftBranchChangedFile[] = [];
	let page = 1;
	let mergeBaseCommit: string | undefined;

	while (true) {
		const response = await octokit.rest.repos.compareCommits({
			owner,
			repo,
			base,
			head,
			per_page: 100,
			page
		});

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

function buildCheapDraftComparison(
	config: ParsedContentConfig,
	configPath: string,
	changedFiles: DraftBranchChangedFile[]
): { comparison: DraftComparison; requiresFullFetch: boolean } | null {
	if (config.content.mode === 'file') {
		const filePath = resolveConfigPath(configPath, config.content.path);
		const relevantFileChanged = changedFiles.some((file) => file.filename === filePath);

		if (!relevantFileChanged) {
			return {
				comparison: emptyComparison(),
				requiresFullFetch: false
			};
		}

		if (!config.collection) {
			return {
				comparison: {
					modified: [{ itemId: '_singleton' }],
					created: [],
					deleted: []
				},
				requiresFullFetch: false
			};
		}

		return {
			comparison: emptyComparison(),
			requiresFullFetch: true
		};
	}

	const resolvedDirectoryPath = resolveConfigPath(configPath, config.content.path);
	const resolvedTemplatePath = resolveConfigPath(configPath, config.content.template);
	const templateFilename = resolvedTemplatePath.split('/').pop() ?? resolvedTemplatePath;
	const templateExt =
		config.content.template.substring(config.content.template.lastIndexOf('.')) || '.md';
	const prefix = resolvedDirectoryPath ? `${resolvedDirectoryPath}/` : '';
	const relevantFiles = changedFiles.filter((file) =>
		isRelevantDirectoryContentChange(file, prefix, templateFilename, templateExt)
	);

	if (relevantFiles.length === 0) {
		return {
			comparison: emptyComparison(),
			requiresFullFetch: false
		};
	}

	const modified: DraftChange[] = [];
	const created: DraftChange[] = [];
	const deleted: DraftChange[] = [];

	for (const file of relevantFiles) {
		const itemId = getDirectoryItemIdFromPath(file.filename);
		if (!itemId) {
			return {
				comparison: emptyComparison(),
				requiresFullFetch: true
			};
		}

		if (file.status === 'renamed') {
			return {
				comparison: emptyComparison(),
				requiresFullFetch: true
			};
		}

		switch (file.status) {
			case 'added':
				created.push({ itemId });
				break;
			case 'removed':
				deleted.push({ itemId });
				break;
			case 'modified':
			case 'changed':
				modified.push({ itemId });
				break;
			default:
				return {
					comparison: emptyComparison(),
					requiresFullFetch: true
				};
		}
	}

	return {
		comparison: {
			modified,
			created,
			deleted
		},
		requiresFullFetch: false
	};
}

function isRelevantDirectoryContentChange(
	file: DraftBranchChangedFile,
	prefix: string,
	templateFilename: string,
	templateExt: string
): boolean {
	if (!file.filename.startsWith(prefix)) {
		return false;
	}

	const relativePath = file.filename.slice(prefix.length);
	if (relativePath.length === 0 || relativePath.includes('/')) {
		return false;
	}

	if (relativePath.startsWith('_')) {
		return false;
	}

	if (relativePath === templateFilename) {
		return false;
	}

	if (relativePath.endsWith('.tentman.json')) {
		return false;
	}

	return relativePath.endsWith(templateExt);
}

function getDirectoryItemIdFromPath(path: string): string | null {
	const filename = path.split('/').pop();
	if (!filename) {
		return null;
	}

	return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Compare singleton content using deep equality
 */
function compareSingleton(mainContent: any, draftContent: any): DraftComparison {
	// Deep equality check using JSON stringify
	const hasChanges = JSON.stringify(mainContent) !== JSON.stringify(draftContent);

	if (!hasChanges) {
		return emptyComparison();
	}

	return {
		modified: [
			{
				itemId: '_singleton',
				mainContent,
				draftContent
			}
		],
		created: [],
		deleted: []
	};
}

function compareItemCollections(
	config: ParsedContentConfig,
	mainContent: ContentRecord[],
	draftContent: ContentRecord[]
): DraftComparison {
	const mainMap = new Map<string, ContentRecord>();
	const draftMap = new Map<string, ContentRecord>();

	for (const item of mainContent) {
		const itemId = getItemId(item) ?? getItemRoute(config, item);
		if (itemId) {
			mainMap.set(itemId, item);
		}
	}

	for (const item of draftContent) {
		const itemId = getItemId(item) ?? getItemRoute(config, item);
		if (itemId) {
			draftMap.set(itemId, item);
		}
	}

	const mainIds = new Set(mainMap.keys());
	const draftIds = new Set(draftMap.keys());

	const modified: DraftChange[] = [];
	const created: DraftChange[] = [];
	const deleted: DraftChange[] = [];

	// Find modified items (exist in both but have different content)
	for (const id of draftIds) {
		if (mainIds.has(id)) {
			const mainItem = mainMap.get(id);
			const draftItem = draftMap.get(id);

			if (JSON.stringify(mainItem) !== JSON.stringify(draftItem)) {
				modified.push({
					itemId: String(id),
					mainContent: mainItem,
					draftContent: draftItem
				});
			}
		}
	}

	// Find created items (only in draft)
	for (const id of draftIds) {
		if (!mainIds.has(id)) {
			created.push({
				itemId: String(id),
				draftContent: draftMap.get(id)
			});
		}
	}

	// Find deleted items (only in main)
	for (const id of mainIds) {
		if (!draftIds.has(id)) {
			deleted.push({
				itemId: String(id),
				mainContent: mainMap.get(id)
			});
		}
	}

	return { modified, created, deleted };
}

/**
 * Return an empty comparison result
 */
function emptyComparison(): DraftComparison {
	return {
		modified: [],
		created: [],
		deleted: []
	};
}

/**
 * Check if a comparison has any changes
 */
export function hasChanges(comparison: DraftComparison): boolean {
	return (
		comparison.modified.length > 0 || comparison.created.length > 0 || comparison.deleted.length > 0
	);
}

/**
 * Get total count of changes
 */
export function getChangeCount(comparison: DraftComparison): number {
	return comparison.modified.length + comparison.created.length + comparison.deleted.length;
}
