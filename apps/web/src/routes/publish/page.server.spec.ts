import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	publishDraftBranch: vi.fn(),
	discardDraftBranch: vi.fn(),
	getTentmanDraftBranchName: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	invalidateContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getDraftChangeIndex: vi.fn(),
	invalidateRepositoryData: vi.fn()
}));

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn(),
	invalidateCache: vi.fn()
}));

import { actions } from './+page.server';
import {
	discardDraftBranch,
	getTentmanDraftBranchName,
	publishDraftBranch
} from '$lib/features/draft-publishing/service';
import { invalidateContent } from '$lib/stores/content-cache';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';
import { getDraftChangeIndex, invalidateRepositoryData } from '$lib/server/repository-data';
import { getCachedConfigs } from '$lib/stores/config-cache';

describe('routes/publish/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			defaultBranch: 'trunk',
			backend: {
				cacheKey: 'github:acme/docs'
			}
		} as never);
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				slug: 'about',
				path: 'content/about.tentman.json',
				config: {
					type: 'content',
					label: 'About',
					content: {
						mode: 'file'
					},
					blocks: []
				}
			}
		] as never);
		vi.mocked(getDraftChangeIndex).mockResolvedValue({
			files: [
				{
					filename: 'src/content/about.md',
					status: 'modified'
				},
				{
					filename: 'src/content/new-about.md',
					previous_filename: 'src/content/old-about.md',
					status: 'renamed'
				}
			]
		} as never);
	});

	it('publishes the managed draft and redirects back to pages', async () => {
		vi.mocked(publishDraftBranch).mockResolvedValue({
			branchName: 'tentman-preview'
		});

		await expect(
			actions.publish({
				locals: {},
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages?merged=true'
		});

		expect(publishDraftBranch).toHaveBeenCalledWith({}, 'acme', 'docs', 'trunk');
		expect(invalidateContent).toHaveBeenCalledWith('github:acme/docs');
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			ref: 'trunk',
			changedPaths: [
				'src/content/about.md',
				'src/content/new-about.md',
				'src/content/old-about.md'
			],
			reason: 'publish'
		});
	});

	it('keeps broad publish invalidation when draft changes cannot be scoped', async () => {
		vi.mocked(getDraftChangeIndex).mockRejectedValue(new Error('compare failed'));
		vi.mocked(publishDraftBranch).mockResolvedValue({
			branchName: 'tentman-preview'
		});

		await expect(
			actions.publish({
				locals: {},
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages?merged=true'
		});

		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			ref: 'trunk',
			changedPaths: undefined,
			reason: 'publish'
		});
	});

	it('discards the managed draft and redirects back to pages', async () => {
		vi.mocked(discardDraftBranch).mockResolvedValue({
			branchName: 'tentman-preview'
		});

		await expect(
			actions.discard({
				locals: {},
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages?cancelled=true'
		});

		expect(discardDraftBranch).toHaveBeenCalledWith({}, 'acme', 'docs', 'trunk');
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			ref: 'tentman-preview',
			reason: 'discard'
		});
	});

	it('routes publish auth failures back through the GitHub route handler', async () => {
		vi.mocked(publishDraftBranch).mockRejectedValue({ status: 401 });

		await expect(
			actions.publish({
				locals: {},
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 500
		});

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/publish'
		);
	});

	it('routes discard auth failures back through the GitHub route handler', async () => {
		vi.mocked(discardDraftBranch).mockRejectedValue({ status: 401 });

		await expect(
			actions.discard({
				locals: {},
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 500
		});

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/publish'
		);
	});
});
