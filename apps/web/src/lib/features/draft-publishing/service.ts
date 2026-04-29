import type { Octokit } from 'octokit';
import { branchExists, createBranch, listPreviewBranches } from '$lib/github/branch';

export async function getLatestPreviewBranchName(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string | undefined> {
	const branches = await listPreviewBranches(octokit, owner, repo);
	return branches[0]?.name;
}

export async function ensureDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	requestedBranchName?: string | null
): Promise<{ branchName: string; created: boolean }> {
	if (requestedBranchName) {
		const exists = await branchExists(octokit, owner, repo, requestedBranchName);
		if (exists) {
			return { branchName: requestedBranchName, created: false };
		}
	}

	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = String(today.getMonth() + 1).padStart(2, '0');
	const dd = String(today.getDate()).padStart(2, '0');
	const baseName = `preview-${yyyy}-${mm}-${dd}`;

	let branchName = requestedBranchName || baseName;
	let sequence = 2;

	while (await branchExists(octokit, owner, repo, branchName)) {
		branchName = `${baseName}-${sequence}`;
		sequence++;
	}

	await createBranch(octokit, owner, repo, branchName);
	return { branchName, created: true };
}
