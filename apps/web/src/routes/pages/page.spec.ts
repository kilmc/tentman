import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	assertWorkflowRequestBudgetForTests,
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';

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

import { clearPagesOverviewWarmReturnCacheForTests, load } from './+page';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

const scopedSummaryStatus = {
	mode: 'scoped',
	source: 'compare-metadata',
	message: 'Tentman summarized this draft from compare metadata.',
	degradedPages: []
} as const;

const githubWorkspaceParentData = {
	isAuthenticated: true,
	selectedRepo: {
		owner: 'acme',
		name: 'docs',
		full_name: 'acme/docs'
	},
	selectedBackend: {
		kind: 'github' as const,
		repo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		}
	},
	configs: [
		{
			slug: 'posts',
			path: 'content/posts.tentman.json',
			config: {
				id: 'posts',
				label: 'Posts',
				collection: true,
				content: {
					mode: 'directory' as const
				},
				blocks: []
			}
		}
	],
	navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
	repositoryIdentity: {
		repoKey: 'github:acme/docs?ref=main',
		mode: 'github',
		label: 'acme/docs',
		ref: 'main',
		headSha: 'head-main',
		treeSha: 'tree-main',
		resolvedAt: 1
	},
	activeDraftBranch: null,
	instructionDiscovery: {
		instructions: [
			{
				path: 'tentman/instructions/create-page',
				definition: {
					id: 'create-page',
					label: 'Create page',
					description: 'Create a page.',
					inputs: []
				},
				templates: []
			}
		],
		issues: []
	}
};

const githubDraftWorkspaceParentData = {
	...githubWorkspaceParentData,
	activeDraftBranch: 'tentman-preview',
	repositoryIdentity: {
		repoKey: 'github:acme/docs?ref=tentman-preview',
		mode: 'github',
		label: 'acme/docs',
		ref: 'tentman-preview',
		headSha: 'head-draft',
		treeSha: 'tree-draft',
		resolvedAt: 1
	}
};

describe('routes/pages/+page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearWorkflowInstrumentationEventsForTests();
		clearPagesOverviewWarmReturnCacheForTests();
		overviewMocks.loadPagesOverviewSummary.mockResolvedValue({
			draftBranch: null,
			changedPages: [],
			totalChanges: 0,
			hasConfigs: true,
			status: scopedSummaryStatus
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
				hasConfigs: false,
				status: scopedSummaryStatus
			},
			canAddPage: false
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
				hasConfigs: false,
				status: scopedSummaryStatus
			},
			canAddPage: false
		});
		expect(overviewMocks.loadPagesOverviewSummary).not.toHaveBeenCalled();
	});

	it('loads the changed pages overview through the thin summary endpoint', async () => {
		const fetcher = vi.fn();
		overviewMocks.loadPagesOverviewSummary.mockResolvedValue({
			draftBranch: 'tentman-preview',
			changedPages: [
				{
					slug: 'posts',
					label: 'Posts',
					changeCount: 2,
					isCollection: true
				}
			],
			totalChanges: 2,
			hasConfigs: true,
			status: scopedSummaryStatus
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
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
					instructionDiscovery: {
						instructions: [
							{
								path: 'tentman/instructions/create-page',
								definition: {
									id: 'create-page',
									label: 'Create page',
									description: 'Create a page.',
									inputs: []
								},
								templates: []
							}
						],
						issues: []
					}
				}),
				fetch: fetcher
			} as never)
		).toEqual({
			summary: {
				draftBranch: 'tentman-preview',
				changedPages: [
					{
						slug: 'posts',
						label: 'Posts',
						changeCount: 2,
						isCollection: true
					}
				],
				totalChanges: 2,
				hasConfigs: true,
				status: scopedSummaryStatus
			},
			canAddPage: true
		});
		expect(overviewMocks.loadPagesOverviewSummary).toHaveBeenCalledWith(fetcher, {
			configs,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
		});
	});

	it('returns to pages from review using the cached no-draft overview summary', async () => {
		const fetcher = vi.fn();
		const summary = {
			draftBranch: null,
			changedPages: [],
			totalChanges: 0,
			hasConfigs: true,
			status: scopedSummaryStatus
		};
		overviewMocks.loadPagesOverviewSummary.mockResolvedValueOnce(summary);

		await load({
			parent: async () => githubWorkspaceParentData,
			fetch: fetcher
		} as never);
		overviewMocks.loadPagesOverviewSummary.mockClear();
		clearWorkflowInstrumentationEventsForTests();

		await expect(
			load({
				parent: async () => githubWorkspaceParentData,
				fetch: fetcher
			} as never)
		).resolves.toEqual({
			summary,
			canAddPage: true
		});
		expect(overviewMocks.loadPagesOverviewSummary).not.toHaveBeenCalled();
		expect(getWorkflowInstrumentationEventsForTests()).toContainEqual(
			expect.objectContaining({
				kind: 'workflow-readiness',
				workflow: 'return-to-pages',
				mark: 'pages-overview-ready',
				route: '/pages'
			})
		);
		assertWorkflowRequestBudgetForTests({
			workflow: 'return-to-pages',
			route: '/pages',
			maxBrowserRequests: 0,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 0
		});
	});

	it('returns to pages from review using the cached draft-bearing overview summary', async () => {
		const fetcher = vi.fn();
		const summary = {
			draftBranch: 'tentman-preview',
			changedPages: [
				{
					slug: 'posts',
					label: 'Posts',
					changeCount: 2,
					isCollection: true
				}
			],
			totalChanges: 2,
			hasConfigs: true,
			status: scopedSummaryStatus
		};
		overviewMocks.loadPagesOverviewSummary.mockResolvedValueOnce(summary);

		await load({
			parent: async () => githubDraftWorkspaceParentData,
			fetch: fetcher
		} as never);
		overviewMocks.loadPagesOverviewSummary.mockClear();
		clearWorkflowInstrumentationEventsForTests();

		await expect(
			load({
				parent: async () => githubDraftWorkspaceParentData,
				fetch: fetcher
			} as never)
		).resolves.toEqual({
			summary,
			canAddPage: true
		});
		expect(overviewMocks.loadPagesOverviewSummary).not.toHaveBeenCalled();
		assertWorkflowRequestBudgetForTests({
			workflow: 'return-to-pages',
			route: '/pages',
			maxBrowserRequests: 0,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 0
		});
	});
});
