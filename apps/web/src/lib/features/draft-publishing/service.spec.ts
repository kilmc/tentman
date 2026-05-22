import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/github/branch', () => ({
	createBranch: vi.fn(),
	deleteBranch: vi.fn()
}));

vi.mock('$lib/github/pull-request', () => ({
	ensureDraftPullRequest: vi.fn(),
	closeDraftPullRequest: vi.fn()
}));

import {
	TENTMAN_DRAFT_BRANCH,
	clearDraftBranchCache,
	discardDraftBranch,
	ensureDraftBranch,
	getTentmanDraftBranchName,
	publishDraftBranch
} from './service';
import { createBranch, deleteBranch } from '$lib/github/branch';
import { closeDraftPullRequest, ensureDraftPullRequest } from '$lib/github/pull-request';

function createOctokit(branchNames: string[]) {
	return {
		rest: {
			repos: {
				getBranch: vi.fn(async ({ branch }: { branch: string }) => {
					if (branchNames.includes(branch)) {
						return {
							data: {
								name: branch
							}
						};
					}

					throw { status: 404 };
				})
			},
			pulls: {
				merge: vi.fn(async () => ({}))
			}
		}
	} as never;
}

describe('draft-publishing/service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearDraftBranchCache();
	});

	it('returns the managed draft branch when it is the only Tentman draft branch', async () => {
		await expect(
			getTentmanDraftBranchName(createOctokit([TENTMAN_DRAFT_BRANCH]), 'acme', 'docs')
		).resolves.toBe(TENTMAN_DRAFT_BRANCH);
	});

	it('returns undefined when no Tentman draft branch exists', async () => {
		await expect(
			getTentmanDraftBranchName(createOctokit(['feature/editor', 'preview-marketing']), 'acme', 'docs')
		).resolves.toBeUndefined();
	});

	it('ignores legacy preview-style branches and only recognizes the canonical draft branch', async () => {
		await expect(
			getTentmanDraftBranchName(
				createOctokit([TENTMAN_DRAFT_BRANCH, 'tentman-preview-2026-04-06']),
				'acme',
				'docs'
			)
		).resolves.toBe(TENTMAN_DRAFT_BRANCH);
	});

	it('caches draft branch lookups until the cache is cleared', async () => {
		const octokit = createOctokit([TENTMAN_DRAFT_BRANCH]);

		await expect(getTentmanDraftBranchName(octokit, 'acme', 'docs')).resolves.toBe(
			TENTMAN_DRAFT_BRANCH
		);
		await expect(getTentmanDraftBranchName(octokit, 'acme', 'docs')).resolves.toBe(
			TENTMAN_DRAFT_BRANCH
		);

		expect(octokit.rest.repos.getBranch).toHaveBeenCalledTimes(1);

		clearDraftBranchCache();

		await expect(getTentmanDraftBranchName(octokit, 'acme', 'docs')).resolves.toBe(
			TENTMAN_DRAFT_BRANCH
		);
		expect(octokit.rest.repos.getBranch).toHaveBeenCalledTimes(2);
	});

	it('reuses the canonical draft branch when it already exists', async () => {
		await expect(
			ensureDraftBranch(createOctokit([TENTMAN_DRAFT_BRANCH]), 'acme', 'docs')
		).resolves.toEqual({
			branchName: TENTMAN_DRAFT_BRANCH,
			created: false
		});
		expect(createBranch).not.toHaveBeenCalled();
	});

	it('creates the canonical draft branch when none exists yet', async () => {
		await expect(
			ensureDraftBranch(createOctokit([]), 'acme', 'docs')
		).resolves.toEqual({
			branchName: TENTMAN_DRAFT_BRANCH,
			created: true
		});

		expect(createBranch).toHaveBeenCalledWith(
			expect.anything(),
			'acme',
			'docs',
			TENTMAN_DRAFT_BRANCH
		);
	});

	it('publishes the managed draft branch through the matching pull request and deletes the branch', async () => {
		const octokit = createOctokit([TENTMAN_DRAFT_BRANCH]);
		vi.mocked(ensureDraftPullRequest).mockResolvedValue({
			number: 42
		} as never);

		await expect(publishDraftBranch(octokit, 'acme', 'docs')).resolves.toEqual({
			branchName: TENTMAN_DRAFT_BRANCH
		});

		expect(ensureDraftPullRequest).toHaveBeenCalledWith(
			octokit,
			'acme',
			'docs',
			TENTMAN_DRAFT_BRANCH
		);
		expect(octokit.rest.pulls.merge).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			pull_number: 42,
			commit_title: 'Publish Tentman draft changes'
		});
		expect(deleteBranch).toHaveBeenCalledWith(octokit, 'acme', 'docs', TENTMAN_DRAFT_BRANCH);
	});

	it('discards the managed draft branch and closes its pull request before deleting it', async () => {
		const octokit = createOctokit([TENTMAN_DRAFT_BRANCH]);

		await expect(discardDraftBranch(octokit, 'acme', 'docs')).resolves.toEqual({
			branchName: TENTMAN_DRAFT_BRANCH
		});

		expect(closeDraftPullRequest).toHaveBeenCalledWith(
			octokit,
			'acme',
			'docs',
			TENTMAN_DRAFT_BRANCH
		);
		expect(deleteBranch).toHaveBeenCalledWith(octokit, 'acme', 'docs', TENTMAN_DRAFT_BRANCH);
	});
});
