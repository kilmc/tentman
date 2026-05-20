import { writable, get } from 'svelte/store';

interface DraftBranchState {
	branchName: string | null;
	repoFullName: string | null;
}

function createDraftBranchStore() {
	const { subscribe, set } = writable<DraftBranchState>({
		branchName: null,
		repoFullName: null
	});

	return {
		subscribe,
		setBranch(branchName: string, repoFullName: string) {
			set({ branchName, repoFullName });
		},

		clear() {
			set({ branchName: null, repoFullName: null });
		},

		hasDraft(repoFullName: string): boolean {
			const state = get(this);
			return state.branchName !== null && state.repoFullName === repoFullName;
		}
	};
}

export const draftBranch = createDraftBranchStore();
