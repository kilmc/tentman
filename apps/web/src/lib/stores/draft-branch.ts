/**
 * Global Draft Branch Store
 *
 * Manages a single draft branch per repository with localStorage persistence.
 * No cookies, no sessions - just check GitHub for branch existence.
 */

import { writable, get } from 'svelte/store';
import type { Octokit } from 'octokit';

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
					if (state.repoFullName === repoFullName && state.branchName) {
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

			// No valid stored branch, check GitHub for any preview-* branches
			try {
				const { listPreviewBranches } = await import('$lib/github/branch');
				const branches = await listPreviewBranches(octokit, owner, repo);

				if (branches.length > 0) {
					// Use the most recent one
					const branchName = branches[0].name;
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
		 * Create new draft branch name with today's date
		 * Format: preview-{yyyy-mm-dd}
		 * If branch exists, append -2, -3, etc.
		 */
		createBranchName(): string {
			const today = new Date();
			const yyyy = today.getFullYear();
			const mm = String(today.getMonth() + 1).padStart(2, '0');
			const dd = String(today.getDate()).padStart(2, '0');
			return `preview-${yyyy}-${mm}-${dd}`;
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
