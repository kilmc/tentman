import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	publishDraftBranch: vi.fn(),
	discardDraftBranch: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	invalidateContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn()
}));

import { actions } from './+page.server';
import {
	discardDraftBranch,
	publishDraftBranch
} from '$lib/features/draft-publishing/service';
import { invalidateContent } from '$lib/stores/content-cache';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';
import { invalidateRepositoryData } from '$lib/server/repository-data';

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
