/**
 * Global Draft Branch Store
 *
 * Manages a single draft branch per repository with localStorage persistence.
 * No cookies, no sessions - just check GitHub for branch existence.
 */

import { writable, get } from 'svelte/store';
import type { Octokit } from 'octokit';
import { TENTMAN_DRAFT_BRANCH } from '$lib/features/draft-publishing/service';

const DRAFT_BRANCH_KEY = 'tentman_draft_branch';

interface DraftBranchState {
	branchName: string | null;
	repoFullName: string | null; // owner/name
}

function createDraftBranchStore() {
	const { subscribe, set, update } = writable<DraftBranchState>({
		branchName: null,
		repoFullName: null
	});

	return {
		subscribe,

		/**
		 * Initialize from localStorage and verify on GitHub
		 * Called on app load to restore draft state
		 */
		async initialize(octokit: Octokit, owner: string, repo: string): Promise<string | null> {
			const repoFullName = `${owner}/${repo}`;
			const stored = localStorage.getItem(DRAFT_BRANCH_KEY);

			if (stored) {
				try {
					const state = JSON.parse(stored) as DraftBranchState;

					// Only use if it's for the current repo
					if (
						state.repoFullName === repoFullName &&
						state.branchName === TENTMAN_DRAFT_BRANCH
					) {
						// Verify branch still exists on GitHub
						const { branchExists } = await import('$lib/github/branch');
						const exists = await branchExists(octokit, owner, repo, state.branchName);

						if (exists) {
							set(state);
							console.log(`✅ Draft branch restored: ${state.branchName}`);
							return state.branchName;
						} else {
							console.log(`⚠️  Stored draft branch no longer exists: ${state.branchName}`);
						}
					}
				} catch (err) {
					console.error('Failed to initialize draft branch from storage:', err);
				}
			}

			// No valid stored branch, ask the draft service for the managed Tentman branch.
			try {
				const { getLatestPreviewBranchName } = await import(
					'$lib/features/draft-publishing/service'
				);
				const branchName = await getLatestPreviewBranchName(octokit, owner, repo);

				if (branchName) {
					this.setBranch(branchName, repoFullName);
					console.log(`✅ Draft branch discovered on GitHub: ${branchName}`);
					return branchName;
				}
			} catch (err) {
				console.error('Failed to check GitHub for preview branches:', err);
			}

			// No draft branch found
			this.clear();
			return null;
		},

		/**
		 * Set draft branch and persist to localStorage
		 */
		setBranch(branchName: string, repoFullName: string) {
			const state = { branchName, repoFullName };
			set(state);
			localStorage.setItem(DRAFT_BRANCH_KEY, JSON.stringify(state));
			console.log(`💾 Draft branch set: ${branchName}`);
		},

		/**
		 * Clear draft branch from store and localStorage
		 */
		clear() {
			set({ branchName: null, repoFullName: null });
			localStorage.removeItem(DRAFT_BRANCH_KEY);
			console.log('🗑️  Draft branch cleared');
		},

		/**
		 * Get the managed Tentman draft branch name.
		 */
		createBranchName(): string {
			return TENTMAN_DRAFT_BRANCH;
		},

		/**
		 * Get current branch name (null if no draft)
		 */
		getBranchName(): string | null {
			return get(this).branchName;
		},

		/**
		 * Check if currently on a draft for this repo
		 */
		hasDraft(repoFullName: string): boolean {
			const state = get(this);
			return state.branchName !== null && state.repoFullName === repoFullName;
		}
	};
}

export const draftBranch = createDraftBranchStore();
