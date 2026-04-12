import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/server/auth/github', () => ({
	isGitHubOAuthConfigured: vi.fn(() => true)
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getLatestPreviewBranchName: vi.fn()
}));

vi.mock('$lib/utils/draft-comparison', () => ({
	compareDraftToBranch: vi.fn()
}));

import { load } from './+page.server';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { requireGitHubRepository } from '$lib/server/page-context';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

describe('routes/pages/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns an empty overview summary in local mode', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: {
						kind: 'local',
						repo: {
							name: 'Docs',
							pathLabel: '~/Docs'
						}
					},
					configs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				})
			} as never)
		).toEqual({
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		});
	});

	it('treats current local locals as authoritative over stale parent GitHub state', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: true,
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					},
					selectedBackend: {
						kind: 'github',
						repo: {
							owner: 'acme',
							name: 'docs',
							full_name: 'acme/docs'
						}
					},
					configs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				locals: {
					isAuthenticated: true,
					selectedBackend: {
						kind: 'local',
						repo: {
							name: 'Docs',
							pathLabel: '~/Sites/docs'
						}
					}
				},
				cookies: {}
			} as never)
		).toEqual({
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		});
	});

	it('redirects unauthenticated users to repos instead of forcing oauth', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null,
					configs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				})
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages&debugFailure=pages-overview-unauthenticated'
		});
	});

	it('prefers the current server locals when parent auth data is stale', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs'
		} as never);
		vi.mocked(getLatestPreviewBranchName).mockResolvedValue(undefined);

		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null,
					configs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				locals: {
					isAuthenticated: true,
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					},
					selectedBackend: {
						kind: 'github',
						repo: {
							owner: 'acme',
							name: 'docs',
							full_name: 'acme/docs'
						}
					}
				},
				cookies: {}
			} as never)
		).toEqual({
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		});
	});

	it('does not crash when parent repo bootstrap data is missing', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs'
		} as never);
		vi.mocked(getLatestPreviewBranchName).mockResolvedValue(undefined);

		expect(
			await load({
				parent: async () => ({
					isAuthenticated: true,
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					},
					selectedBackend: {
						kind: 'github',
						repo: {
							owner: 'acme',
							name: 'docs',
							full_name: 'acme/docs'
						}
					}
				}),
				locals: {
					isAuthenticated: true,
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					},
					selectedBackend: {
						kind: 'github',
						repo: {
							owner: 'acme',
							name: 'docs',
							full_name: 'acme/docs'
						}
					}
				},
				cookies: {}
			} as never)
		).toEqual({
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		});
	});

	it('summarizes the changed pages for the overview screen', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs'
		} as never);
		vi.mocked(getLatestPreviewBranchName).mockResolvedValue('preview-2026-04-06');
		vi.mocked(compareDraftToBranch)
			.mockResolvedValueOnce({
				modified: [],
				created: [],
				deleted: []
			})
			.mockResolvedValueOnce({
				modified: [{ itemId: 'hello-world' }],
				created: [{ itemId: 'second-post' }],
				deleted: []
			});

		expect(
			await load({
				parent: async () => ({
					isAuthenticated: true,
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					},
					selectedBackend: {
						kind: 'github',
						repo: {
							owner: 'acme',
							name: 'docs',
							full_name: 'acme/docs'
						}
					},
					configs: [
						{
							slug: 'about',
							path: 'content/about.tentman.json',
							config: {
								id: 'about',
								label: 'About Page',
								collection: false,
								content: {
									mode: 'file'
								},
								blocks: []
							}
						},
						{
							slug: 'posts',
							path: 'content/posts.tentman.json',
							config: {
								id: 'posts',
								label: 'Posts',
								collection: true,
								content: {
									mode: 'directory'
								},
								blocks: []
							}
						}
					],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				locals: {},
				cookies: {}
			} as never)
		).toEqual({
			summary: {
				draftBranch: 'preview-2026-04-06',
				changedPages: [
					{
						slug: 'posts',
						label: 'Posts',
						changeCount: 2,
						isCollection: true
					}
				],
				totalChanges: 2,
				hasConfigs: true
			}
		});
	});
});
