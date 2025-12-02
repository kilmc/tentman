/**
 * Draft Comparison Utility
 *
 * Compares content between main and draft branches to identify changes.
 * Handles all three content types: singleton, array, and collection.
 */

import type { Octokit } from 'octokit';
import type { Config, ConfigType } from '$lib/types/config';
import { fetchContent } from '$lib/content/fetcher';

export interface DraftChange {
	itemId: string;
	mainContent?: any;
	draftContent?: any;
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
 * @param configType - Type of configuration (singleton, array, collection)
 * @param configPath - Path to config file
 * @param draftBranch - Name of the draft branch
 * @returns Comparison result showing modified, created, and deleted items
 */
export async function compareDraftToBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: ConfigType,
	configPath: string,
	draftBranch: string
): Promise<DraftComparison> {
	try {
		// Check if draft branch exists and gather metadata
		const metadata = await getBranchMetadata(octokit, owner, repo, draftBranch);

		if (!metadata.branchExists) {
			console.log(`[DRAFT COMPARISON] Branch ${draftBranch} does not exist, returning empty comparison`);
			return { ...emptyComparison(), metadata };
		}

		// Fetch content from both branches
		const [mainContent, draftContent] = await Promise.all([
			fetchContent(octokit, owner, repo, config, configType, configPath, 'main'),
			fetchContent(octokit, owner, repo, config, configType, configPath, draftBranch)
		]);

		// Compare based on content type
		let comparison: DraftComparison;
		switch (configType) {
			case 'singleton':
				comparison = compareSingleton(mainContent, draftContent);
				break;
			case 'array':
				comparison = compareArray(mainContent, draftContent, config.idField!);
				break;
			case 'collection':
				comparison = compareCollection(mainContent, draftContent);
				break;
		}

		// Attach metadata to comparison result
		comparison.metadata = metadata;
		return comparison;
	} catch (error) {
		console.error(`[DRAFT COMPARISON] Failed to compare draft:`, error);
		// Gracefully degrade - return empty comparison
		return emptyComparison();
	}
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

/**
 * Compare array content using ID field
 */
function compareArray(
	mainContent: any[],
	draftContent: any[],
	idField: string
): DraftComparison {
	// Build Sets of IDs for efficient lookup
	const mainIds = new Set(mainContent.map((item) => item[idField]));
	const draftIds = new Set(draftContent.map((item) => item[idField]));

	// Build maps for content lookup
	const mainMap = new Map(mainContent.map((item) => [item[idField], item]));
	const draftMap = new Map(draftContent.map((item) => [item[idField], item]));

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
 * Compare collection content using _filename as identifier
 */
function compareCollection(mainContent: any[], draftContent: any[]): DraftComparison {
	// Use _filename as the identifier for collections
	const mainFilenames = new Set(mainContent.map((item) => item._filename));
	const draftFilenames = new Set(draftContent.map((item) => item._filename));

	// Build maps for content lookup
	const mainMap = new Map(mainContent.map((item) => [item._filename, item]));
	const draftMap = new Map(draftContent.map((item) => [item._filename, item]));

	const modified: DraftChange[] = [];
	const created: DraftChange[] = [];
	const deleted: DraftChange[] = [];

	// Find modified items (exist in both but have different content)
	for (const filename of draftFilenames) {
		if (mainFilenames.has(filename)) {
			const mainItem = mainMap.get(filename);
			const draftItem = draftMap.get(filename);

			if (JSON.stringify(mainItem) !== JSON.stringify(draftItem)) {
				modified.push({
					itemId: filename.replace(/\.[^/.]+$/, ''), // Remove file extension for URL routing
					mainContent: mainItem,
					draftContent: draftItem
				});
			}
		}
	}

	// Find created items (only in draft)
	for (const filename of draftFilenames) {
		if (!mainFilenames.has(filename)) {
			created.push({
				itemId: filename.replace(/\.[^/.]+$/, ''), // Remove file extension for URL routing
				draftContent: draftMap.get(filename)
			});
		}
	}

	// Find deleted items (only in main)
	for (const filename of mainFilenames) {
		if (!draftFilenames.has(filename)) {
			deleted.push({
				itemId: filename.replace(/\.[^/.]+$/, ''), // Remove file extension for URL routing
				mainContent: mainMap.get(filename)
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
		comparison.modified.length > 0 ||
		comparison.created.length > 0 ||
		comparison.deleted.length > 0
	);
}

/**
 * Get total count of changes
 */
export function getChangeCount(comparison: DraftComparison): number {
	return comparison.modified.length + comparison.created.length + comparison.deleted.length;
}
