import type { Octokit } from 'octokit';
import { branchExists, createBranch } from '$lib/github/branch';

export const TENTMAN_DRAFT_BRANCH = 'tentman-preview';
const LEGACY_TENTMAN_DRAFT_BRANCH_PATTERN = /^tentman-preview-.+$/;

export class DraftBranchConflictError extends Error {
	readonly branchNames: string[];
	readonly status = 409;

	constructor(branchNames: string[]) {
		super(
			`Tentman found conflicting draft branches (${branchNames.join(
				', '
			)}). Merge or delete them before continuing.`
		);
		this.name = 'DraftBranchConflictError';
		this.branchNames = branchNames;
	}
}

async function listTentmanDraftBranches(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string[]> {
	const { data: branches } = await octokit.rest.repos.listBranches({
		owner,
		repo,
		per_page: 100
	});

	return branches
		.map((branch) => branch.name)
		.filter(
			(branchName) =>
				branchName === TENTMAN_DRAFT_BRANCH ||
				LEGACY_TENTMAN_DRAFT_BRANCH_PATTERN.test(branchName)
		)
		.sort();
}

export async function getLatestPreviewBranchName(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string | undefined> {
	const branches = await listTentmanDraftBranches(octokit, owner, repo);

	if (branches.length === 0) {
		return undefined;
	}

	if (branches.length !== 1 || branches[0] !== TENTMAN_DRAFT_BRANCH) {
		throw new DraftBranchConflictError(branches);
	}

	return TENTMAN_DRAFT_BRANCH;
}

export async function ensureDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	requestedBranchName?: string | null
): Promise<{ branchName: string; created: boolean }> {
	if (requestedBranchName && requestedBranchName !== TENTMAN_DRAFT_BRANCH) {
		throw new DraftBranchConflictError([requestedBranchName]);
	}

	const existingBranchName = await getLatestPreviewBranchName(octokit, owner, repo);
	if (existingBranchName) {
		return {
			branchName: existingBranchName,
			created: false
		};
	}

	const exists = await branchExists(octokit, owner, repo, TENTMAN_DRAFT_BRANCH);
	if (exists) {
		return {
			branchName: TENTMAN_DRAFT_BRANCH,
			created: false
		};
	}

	await createBranch(octokit, owner, repo, TENTMAN_DRAFT_BRANCH);
	return {
		branchName: TENTMAN_DRAFT_BRANCH,
		created: true
	};
}
