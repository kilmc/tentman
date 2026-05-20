import type { Octokit } from 'octokit';
import { createBranch, deleteBranch } from '$lib/github/branch';
import { closeDraftPullRequest, ensureDraftPullRequest } from '$lib/github/pull-request';

export const TENTMAN_DRAFT_BRANCH = 'tentman-preview';

export class MissingDraftBranchError extends Error {
	readonly status = 400;

	constructor() {
		super('No draft branch found');
		this.name = 'MissingDraftBranchError';
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
		.filter((branchName) => branchName === TENTMAN_DRAFT_BRANCH)
		.sort();
}

export async function getTentmanDraftBranchName(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string | undefined> {
	const branches = await listTentmanDraftBranches(octokit, owner, repo);

	if (branches.length === 0) {
		return undefined;
	}

	return TENTMAN_DRAFT_BRANCH;
}

export async function ensureDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<{ branchName: string; created: boolean }> {
	const existingBranchName = await getTentmanDraftBranchName(octokit, owner, repo);
	if (existingBranchName) {
		return {
			branchName: existingBranchName,
			created: false
		};
	}

	await createBranch(octokit, owner, repo, TENTMAN_DRAFT_BRANCH);
	return {
		branchName: TENTMAN_DRAFT_BRANCH,
		created: true
	};
}

export async function publishDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<{ branchName: string }> {
	const draftBranch = await getTentmanDraftBranchName(octokit, owner, repo);

	if (!draftBranch) {
		throw new MissingDraftBranchError();
	}

	const pullRequest = await ensureDraftPullRequest(octokit, owner, repo, draftBranch);
	await octokit.rest.pulls.merge({
		owner,
		repo,
		pull_number: pullRequest.number,
		commit_title: 'Publish Tentman draft changes'
	});
	await deleteBranch(octokit, owner, repo, draftBranch);

	return { branchName: draftBranch };
}

export async function discardDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<{ branchName: string }> {
	const draftBranch = await getTentmanDraftBranchName(octokit, owner, repo);

	if (!draftBranch) {
		throw new MissingDraftBranchError();
	}

	await closeDraftPullRequest(octokit, owner, repo, draftBranch);
	await deleteBranch(octokit, owner, repo, draftBranch);

	return { branchName: draftBranch };
}
