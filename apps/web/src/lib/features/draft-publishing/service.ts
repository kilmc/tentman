import type { Octokit } from 'octokit';
import { createBranch, deleteBranch } from '$lib/github/branch';
import { closeDraftPullRequest, ensureDraftPullRequest } from '$lib/github/pull-request';

export const TENTMAN_DRAFT_BRANCH = 'tentman-preview';
const DRAFT_BRANCH_CACHE_TTL = 60 * 1000;

interface CachedDraftBranchEntry {
	value: string | undefined;
	timestamp: number;
}

const draftBranchCache = new Map<string, CachedDraftBranchEntry>();
const draftBranchInflight = new Map<string, Promise<string | undefined>>();

export class MissingDraftBranchError extends Error {
	readonly status = 400;

	constructor() {
		super('No draft branch found');
		this.name = 'MissingDraftBranchError';
	}
}

function getDraftBranchCacheKey(owner: string, repo: string): string {
	return `${owner}/${repo}:${TENTMAN_DRAFT_BRANCH}`;
}

function isFreshDraftBranchEntry(
	entry: CachedDraftBranchEntry | undefined
): entry is CachedDraftBranchEntry {
	return entry !== undefined && Date.now() - entry.timestamp < DRAFT_BRANCH_CACHE_TTL;
}

export function invalidateDraftBranchCache(owner: string, repo: string): void {
	const cacheKey = getDraftBranchCacheKey(owner, repo);
	draftBranchCache.delete(cacheKey);
	draftBranchInflight.delete(cacheKey);
}

export function clearDraftBranchCache(): void {
	draftBranchCache.clear();
	draftBranchInflight.clear();
}

async function readTentmanDraftBranchName(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string | undefined> {
	try {
		await octokit.rest.repos.getBranch({
			owner,
			repo,
			branch: TENTMAN_DRAFT_BRANCH
		});

		return TENTMAN_DRAFT_BRANCH;
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
			return undefined;
		}

		throw error;
	}
}

export async function getTentmanDraftBranchName(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<string | undefined> {
	const cacheKey = getDraftBranchCacheKey(owner, repo);
	const cachedEntry = draftBranchCache.get(cacheKey);
	if (isFreshDraftBranchEntry(cachedEntry)) {
		return cachedEntry.value;
	}

	const pending = draftBranchInflight.get(cacheKey);
	if (pending) {
		return pending;
	}

	const fetchPromise = readTentmanDraftBranchName(octokit, owner, repo)
		.then((value) => {
			draftBranchCache.set(cacheKey, {
				value,
				timestamp: Date.now()
			});
			return value;
		})
		.finally(() => {
			draftBranchInflight.delete(cacheKey);
		});

	draftBranchInflight.set(cacheKey, fetchPromise);
	return fetchPromise;
}

export async function ensureDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	baseBranch: string
): Promise<{ branchName: string; created: boolean }> {
	const existingBranchName = await getTentmanDraftBranchName(octokit, owner, repo);
	if (existingBranchName) {
		return {
			branchName: existingBranchName,
			created: false
		};
	}

	await createBranch(octokit, owner, repo, TENTMAN_DRAFT_BRANCH, baseBranch);
	draftBranchCache.set(getDraftBranchCacheKey(owner, repo), {
		value: TENTMAN_DRAFT_BRANCH,
		timestamp: Date.now()
	});
	draftBranchInflight.delete(getDraftBranchCacheKey(owner, repo));
	return {
		branchName: TENTMAN_DRAFT_BRANCH,
		created: true
	};
}

export async function publishDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	baseBranch: string
): Promise<{ branchName: string }> {
	const draftBranch = await getTentmanDraftBranchName(octokit, owner, repo);

	if (!draftBranch) {
		throw new MissingDraftBranchError();
	}

	const pullRequest = await ensureDraftPullRequest(octokit, owner, repo, draftBranch, baseBranch);
	await octokit.rest.pulls.merge({
		owner,
		repo,
		pull_number: pullRequest.number,
		commit_title: 'Publish Tentman draft changes'
	});
	await deleteBranch(octokit, owner, repo, draftBranch);
	invalidateDraftBranchCache(owner, repo);

	return { branchName: draftBranch };
}

export async function discardDraftBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	baseBranch: string
): Promise<{ branchName: string }> {
	const draftBranch = await getTentmanDraftBranchName(octokit, owner, repo);

	if (!draftBranch) {
		throw new MissingDraftBranchError();
	}

	await closeDraftPullRequest(octokit, owner, repo, draftBranch, baseBranch);
	await deleteBranch(octokit, owner, repo, draftBranch);
	invalidateDraftBranchCache(owner, repo);

	return { branchName: draftBranch };
}
