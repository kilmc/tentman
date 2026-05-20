import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/github/branch', () => ({
	createBranch: vi.fn()
}));

import { TENTMAN_DRAFT_BRANCH, ensureDraftBranch, getTentmanDraftBranchName } from './service';
import { createBranch } from '$lib/github/branch';

function createOctokit(branchNames: string[]) {
	return {
		rest: {
			repos: {
				listBranches: vi.fn(async () => ({
					data: branchNames.map((name) => ({
						name
					}))
				}))
			}
		}
	} as never;
}

describe('draft-publishing/service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
