import { beforeEach, describe, expect, it, vi } from 'vitest';

const overviewMocks = vi.hoisted(() => ({
	loadPagesOverviewSummary: vi.fn()
}));

vi.mock('$lib/features/content-management/overview-summary', async () => {
	const actual = await vi.importActual<
		typeof import('$lib/features/content-management/overview-summary')
	>('$lib/features/content-management/overview-summary');

	return {
		...actual,
		loadPagesOverviewSummary: overviewMocks.loadPagesOverviewSummary
	};
});

import { load } from './+page';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

describe('routes/pages/+page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		overviewMocks.loadPagesOverviewSummary.mockResolvedValue({
			draftBranch: null,
			changedPages: [],
			totalChanges: 0,
			hasConfigs: true
		});
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
				}),
				fetch: vi.fn()
			} as never)
		).toEqual({
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		});
		expect(overviewMocks.loadPagesOverviewSummary).not.toHaveBeenCalled();
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
				}),
				fetch: vi.fn()
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages&debugFailure=pages-overview-unauthenticated'
		});
	});

	it('redirects authenticated users without a selected repo to repos', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
					selectedRepo: null,
					selectedBackend: null,
					configs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				fetch: vi.fn()
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages&debugFailure=pages-overview-missing-repo'
		});
	});

	it('does not call the summary endpoint when repo bootstrap data is missing', async () => {
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
				fetch: vi.fn()
			} as never)
		).toEqual({
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		});
		expect(overviewMocks.loadPagesOverviewSummary).not.toHaveBeenCalled();
	});

	it('loads the changed pages overview through the thin summary endpoint', async () => {
		const fetcher = vi.fn();
		overviewMocks.loadPagesOverviewSummary.mockResolvedValue({
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
		});
		const configs = [
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
		];

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
					configs,
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				fetch: fetcher
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
		expect(overviewMocks.loadPagesOverviewSummary).toHaveBeenCalledWith(fetcher, {
			configs,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
		});
	});
});
