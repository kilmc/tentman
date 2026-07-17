import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getTentmanDraftBranchName: vi.fn()
}));

vi.mock('$lib/features/review-draft/build-review-model', () => ({
	buildPublishReviewModel: vi.fn()
}));

vi.mock('$lib/features/review-draft/review-cost-guard', () => ({
	getBlockedPublishReview: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getDraftChangeIndex: vi.fn(),
	getRepositorySnapshot: vi.fn()
}));

import { GET } from '../../routes/api/repo/publish-view/+server';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { buildPublishReviewModel } from '$lib/features/review-draft/build-review-model';
import { getBlockedPublishReview } from '$lib/features/review-draft/review-cost-guard';
import { requireGitHubRepository } from '$lib/server/page-context';
import { getDraftChangeIndex, getRepositorySnapshot } from '$lib/server/repository-data';
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
		vi.mocked(getBlockedPublishReview).mockReturnValue(null);
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
		const configs = [
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
		];
		const draftChangeIndex = {
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'trunk',
			draftBranch: 'tentman-preview',
			metadata: {
				branchExists: true
			},
			files: [
				{
					filename: 'src/content/posts/hello.md',
					status: 'modified'
				}
			],
			byConfigSlug: new Map()
		};
		const baseSnapshot = {
			configIndex: {
				configs
			}
		};
		vi.mocked(getRepositorySnapshot).mockResolvedValueOnce(baseSnapshot as never);
		vi.mocked(getDraftChangeIndex).mockResolvedValue(draftChangeIndex as never);
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
			hasHiddenUnreviewedChanges: false,
			reviewStatus: {
				mode: 'scoped',
				source: 'changed-documents',
				message: 'Tentman reviewed only the changed documents from this draft.',
				changedFileCount: 1,
				degradedChanges: []
			}
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
		expect(getDraftChangeIndex).toHaveBeenCalledWith({
			octokit: {},
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'trunk',
			draftBranch: 'tentman-preview',
			configs
		});
		expect(getRepositorySnapshot).toHaveBeenCalledTimes(1);
		expect(getRepositorySnapshot).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			ref: 'trunk'
		});
		expect(buildPublishReviewModel).toHaveBeenCalledWith(
			expect.objectContaining({
				changedFiles: draftChangeIndex.files,
				baseSnapshot
			})
		);
	});

	it('blocks review loading before building an expensive review model', async () => {
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
		const configs = [
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
			}
		];
		const draftChangeIndex = {
			files: [
				{
					filename: 'src/content/posts/hello.md',
					status: 'modified'
				}
			],
			byConfigSlug: new Map()
		};
		const blockedReview = {
			title: 'Review Draft blocked',
			message: 'Contact Kilian before continuing.',
			changedFileCount: 81,
			estimatedReviewDocumentReads: 0,
			limits: {
				maxChangedFiles: 80,
				maxReviewDocumentReads: 40
			} as const,
			reasons: ['Too many changed files']
		};
		vi.mocked(getRepositorySnapshot).mockResolvedValue({
			configIndex: {
				configs
			}
		} as never);
		vi.mocked(getDraftChangeIndex).mockResolvedValue(draftChangeIndex as never);
		vi.mocked(getBlockedPublishReview).mockReturnValue(blockedReview);

		const response = await GET({
			locals: {},
			cookies: createCookies()
		} as never);

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({
			draftBranch: {
				name: 'tentman-preview'
			},
			blockedReview
		});
		expect(getRepositorySnapshot).toHaveBeenCalledTimes(1);
		expect(buildPublishReviewModel).not.toHaveBeenCalled();
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
