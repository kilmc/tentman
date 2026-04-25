/**
 * Draft Comparison Utility
 *
 * Compares content between main and draft branches to identify changes.
 */

import type { Octokit } from 'octokit';
import type { ParsedContentConfig } from '$lib/config/parse';
import { fetchContentDocument } from '$lib/content/service';
import { getItemId } from '$lib/features/content-management/item';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import { createGitHubRepositoryBackend } from '$lib/repository/github';

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
		// Check if draft branch exists and gather metadata
		const metadata = await getBranchMetadata(octokit, owner, repo, draftBranch);

		if (!metadata.branchExists) {
			console.log(
				`[DRAFT COMPARISON] Branch ${draftBranch} does not exist, returning empty comparison`
			);
			return { ...emptyComparison(), metadata };
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

		// Attach metadata to comparison result
		comparison.metadata = metadata;
		return comparison;
	} catch (error) {
		console.error(`[DRAFT COMPARISON] Failed to compare draft:`, error);
		// Gracefully degrade - return empty comparison
		return emptyComparison();
	}
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
 * Check if a branch exists in the repository
 */
async function checkBranchExists(
	octokit: Octokit,
	owner: string,
	repo: string,
	branch: string
): Promise<boolean> {
	try {
		await octokit.rest.repos.getBranch({
			owner,
			repo,
			branch
		});
		return true;
	} catch (error: any) {
		if (error.status === 404) {
			return false;
		}
		throw error;
	}
}

/**
 * Get metadata about the draft branch including staleness and conflict detection
 */
async function getBranchMetadata(
	octokit: Octokit,
	owner: string,
	repo: string,
	draftBranch: string
): Promise<DraftMetadata> {
	try {
		// Check if branch exists
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

		// Compare commits to detect if main has advanced
		const comparison = await octokit.rest.repos.compareCommits({
			owner,
			repo,
			base: draftCommitSha,
			head: mainHeadCommit
		});

		// If there are commits ahead, main has advanced and there may be conflicts
		const hasConflicts = comparison.data.ahead_by > 0;

		// Get the base commit where draft branched from main
		// This is approximated by finding the merge base
		let draftBaseCommit: string | undefined;
		try {
			const mergeBase = await octokit.rest.repos.compareCommits({
				owner,
				repo,
				base: 'main',
				head: draftBranch
			});
			draftBaseCommit = mergeBase.data.merge_base_commit.sha;
		} catch (error) {
			console.warn('[DRAFT METADATA] Could not determine merge base:', error);
		}

		return {
			branchExists: true,
			lastCommitDate,
			isStale,
			hasConflicts,
			draftBaseCommit,
			mainHeadCommit
		};
	} catch (error: any) {
		if (error.status === 404) {
			return { branchExists: false };
		}
		console.error('[DRAFT METADATA] Error getting branch metadata:', error);
		// Return minimal metadata on error
		return { branchExists: true };
	}
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
		const itemId = getItemId(item);
		if (itemId) {
			mainMap.set(itemId, item);
		}
	}

	for (const item of draftContent) {
		const itemId = getItemId(item);
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
