type SelectedRepo = {
	owner: string;
	name: string;
};

interface DraftBranchStoreLike {
	setBranch(branchName: string, repoFullName: string): void;
	hasDraft(repoFullName: string): boolean;
	clear(): void;
}

export function syncDraftBranchStoreForRepo(
	selectedRepo: SelectedRepo | null | undefined,
	draftBranch: string | null,
	draftBranchStore: DraftBranchStoreLike
) {
	if (!selectedRepo) {
		return;
	}

	const repoFullName = `${selectedRepo.owner}/${selectedRepo.name}`;

	if (draftBranch) {
		draftBranchStore.setBranch(draftBranch, repoFullName);
		return;
	}

	if (draftBranchStore.hasDraft(repoFullName)) {
		draftBranchStore.clear();
	}
}
