import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getTentmanDraftBranchName: vi.fn()
}));

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

vi.mock('$lib/features/review-draft/build-review-model', () => ({
	buildPublishReviewModel: vi.fn()
}));

import { GET } from '../../routes/api/repo/publish-view/+server';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { buildPublishReviewModel } from '$lib/features/review-draft/build-review-model';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { requireGitHubRepository } from '$lib/server/page-context';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

describe('GET /api/repo/publish-view', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the publish review bootstrap payload', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk'
			},
			backend: { cacheKey: 'github:acme/docs' }
		} as never);
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				slug: 'posts',
				path: 'content/posts.tentman.json',
				config: {
					label: 'Posts',
					collection: true,
					content: {
						mode: 'directory'
					},
					blocks: []
				}
			},
			{
				slug: 'about',
				path: 'content/about.tentman.json',
				config: {
					label: 'About',
					collection: false,
					content: {
						mode: 'file'
					},
					blocks: []
				}
			}
		] as never);
		vi.mocked(buildPublishReviewModel).mockResolvedValue({
			topLevelOrderChange: {
				title: 'Top-level content order',
				href: '/pages',
				before: [{ id: 'about', label: 'About', position: 1 }],
				after: [{ id: 'posts', label: 'Posts', position: 1 }]
			},
			sections: [
				{
					configSlug: 'posts',
					configLabel: 'Posts',
					isCollection: true,
					badges: [{ label: 'Edited', tone: 'neutral' }],
					defaultExpanded: true,
					navigationHref: '/pages/posts',
					collectionOrderChange: null,
					items: []
				}
			],
			otherSiteChanges: null,
			hasHiddenUnreviewedChanges: false
		});

		const response = await GET({
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			draftBranch: {
				name: 'tentman-preview'
			},
			reviewModel: {
				topLevelOrderChange: {
					title: 'Top-level content order'
				},
				sections: [
					{
						configSlug: 'posts'
					}
				]
			}
		});
	});

	it('clears the session and returns 401 on GitHub auth failure', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk'
			},
			backend: { cacheKey: 'github:acme/docs' }
		} as never);
		vi.mocked(getTentmanDraftBranchName).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				locals: {},
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
	});
});
