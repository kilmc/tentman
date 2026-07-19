import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	assertWorkflowRequestBudgetForTests,
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';

const mocks = vi.hoisted(() => ({
	loadRepoConfigsBootstrap: vi.fn()
}));

vi.mock('$lib/repository/config-bootstrap', async () => {
	const actual = await vi.importActual<typeof import('$lib/repository/config-bootstrap')>(
		'$lib/repository/config-bootstrap'
	);

	return {
		...actual,
		loadRepoConfigsBootstrap: mocks.loadRepoConfigsBootstrap
	};
});

import { _clearPagesWorkspaceWarmReturnCacheForTests, load } from './+layout';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

const emptyInstructionDiscovery = {
	instructions: [],
	issues: []
};

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
	}
};

function createGithubWorkspaceParentData(repositoryIdentity = createRepoIdentity()) {
	return {
		...githubWorkspaceParentData,
		selectedRepoConfigSummary: {
			repositoryIdentity
		}
	};
}

function createRepoIdentity(ref = 'main') {
	return {
		repoKey: `github:acme/docs?ref=${ref}`,
		mode: 'github',
		label: 'acme/docs',
		ref,
		headSha: `head-${ref}`,
		treeSha: `tree-${ref}`,
		resolvedAt: 1
	};
}

describe('routes/pages/+layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearWorkflowInstrumentationEventsForTests();
		_clearPagesWorkspaceWarmReturnCacheForTests();
		mocks.loadRepoConfigsBootstrap.mockResolvedValue({
			configs: [
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
			],
			blockConfigs: [],
			rootConfig: null,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
		});
	});

	it('returns empty configs when the GitHub bootstrap is not yet available', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false
				}),
				fetch: vi.fn()
			} as never)
		).toEqual({
			...EMPTY_REPO_CONFIGS_BOOTSTRAP,
			instructionDiscovery: emptyInstructionDiscovery
		});
	});

	it('loads repo configs through the thin repo configs endpoint for GitHub mode', async () => {
		const fetcher = vi.fn();

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
				fetch: fetcher
			} as never)
		).toEqual({
			configs: [
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
			],
			blockConfigs: [],
			rootConfig: null,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			instructionDiscovery: emptyInstructionDiscovery
		});
		expect(mocks.loadRepoConfigsBootstrap).toHaveBeenCalledWith(fetcher);
	});

	it('returns to pages from review using the cached no-draft workspace bootstrap', async () => {
		const fetcher = vi.fn();
		const bootstrap = {
			configs: [
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory' as const
						},
						blocks: []
					}
				}
			],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Acme Docs'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			singletonContentIdentities: {},
			activeDraftBranch: null,
			repositoryIdentity: createRepoIdentity()
		};
		mocks.loadRepoConfigsBootstrap.mockResolvedValueOnce(bootstrap);
		const parentData = createGithubWorkspaceParentData(createRepoIdentity());

		await load({
			parent: async () => parentData,
			fetch: fetcher
		} as never);
		mocks.loadRepoConfigsBootstrap.mockClear();
		fetcher.mockClear();
		clearWorkflowInstrumentationEventsForTests();

		await expect(
			load({
				parent: async () => parentData,
				fetch: fetcher
			} as never)
		).resolves.toMatchObject({
			configs: bootstrap.configs,
			rootConfig: {
				siteName: 'Acme Docs'
			},
			activeDraftBranch: null,
			repositoryIdentity: createRepoIdentity(),
			instructionDiscovery: emptyInstructionDiscovery
		});
		expect(mocks.loadRepoConfigsBootstrap).not.toHaveBeenCalled();
		expect(fetcher).not.toHaveBeenCalled();
		expect(getWorkflowInstrumentationEventsForTests()).toContainEqual(
			expect.objectContaining({
				kind: 'workflow-readiness',
				workflow: 'return-to-pages',
				mark: 'workspace-shell-ready',
				route: '/pages'
			})
		);
		expect(getWorkflowInstrumentationEventsForTests()).toContainEqual(
			expect.objectContaining({
				kind: 'workflow-readiness',
				workflow: 'return-to-pages',
				mark: 'validation-deferred',
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

	it('returns to pages from review using the cached draft-bearing workspace bootstrap', async () => {
		const fetcher = vi.fn();
		const draftIdentity = createRepoIdentity('tentman-preview');
		const bootstrap = {
			configs: [
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory' as const
						},
						blocks: []
					}
				}
			],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Acme Draft Docs'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			singletonContentIdentities: {},
			activeDraftBranch: 'tentman-preview',
			repositoryIdentity: draftIdentity,
			mainRepositoryIdentity: createRepoIdentity(),
			draftRepositoryIdentity: draftIdentity
		};
		mocks.loadRepoConfigsBootstrap.mockResolvedValueOnce(bootstrap);
		const parentData = createGithubWorkspaceParentData(draftIdentity);

		await load({
			parent: async () => parentData,
			fetch: fetcher
		} as never);
		mocks.loadRepoConfigsBootstrap.mockClear();
		fetcher.mockClear();
		clearWorkflowInstrumentationEventsForTests();

		await expect(
			load({
				parent: async () => parentData,
				fetch: fetcher
			} as never)
		).resolves.toMatchObject({
			configs: bootstrap.configs,
			rootConfig: {
				siteName: 'Acme Draft Docs'
			},
			activeDraftBranch: 'tentman-preview',
			repositoryIdentity: draftIdentity,
			mainRepositoryIdentity: createRepoIdentity(),
			draftRepositoryIdentity: draftIdentity,
			instructionDiscovery: emptyInstructionDiscovery
		});
		expect(mocks.loadRepoConfigsBootstrap).not.toHaveBeenCalled();
		expect(fetcher).not.toHaveBeenCalled();
		assertWorkflowRequestBudgetForTests({
			workflow: 'return-to-pages',
			route: '/pages',
			maxBrowserRequests: 0,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 0
		});
	});

	it('does not reuse stale warm-return bootstrap data after the repository identity changes', async () => {
		const fetcher = vi.fn();
		const staleBootstrap = {
			configs: [],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Stale Shell'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			singletonContentIdentities: {},
			activeDraftBranch: null,
			repositoryIdentity: createRepoIdentity()
		};
		const refreshedIdentity = {
			...createRepoIdentity(),
			headSha: 'head-next',
			treeSha: 'tree-next'
		};
		const refreshedBootstrap = {
			configs: [],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Fresh Shell'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			singletonContentIdentities: {},
			activeDraftBranch: null,
			repositoryIdentity: refreshedIdentity
		};
		mocks.loadRepoConfigsBootstrap
			.mockResolvedValueOnce(staleBootstrap)
			.mockResolvedValueOnce(refreshedBootstrap);

		await load({
			parent: async () => githubWorkspaceParentData,
			fetch: fetcher
		} as never);
		mocks.loadRepoConfigsBootstrap.mockClear();
		clearWorkflowInstrumentationEventsForTests();

		await expect(
			load({
				parent: async () => ({
					...githubWorkspaceParentData,
					selectedRepoConfigSummary: {
						repositoryIdentity: refreshedIdentity
					}
				}),
				fetch: fetcher
			} as never)
		).resolves.toMatchObject({
			rootConfig: {
				siteName: 'Fresh Shell'
			},
			repositoryIdentity: refreshedIdentity
		});
		expect(mocks.loadRepoConfigsBootstrap).toHaveBeenCalledWith(fetcher);
		expect(getWorkflowInstrumentationEventsForTests()).toContainEqual(
			expect.objectContaining({
				kind: 'route-data-fallback',
				route: '/pages',
				source: 'pages-layout:warm-return',
				reason: 'repository-identity-changed'
			})
		);
	});

	it('refreshes the workspace bootstrap after publish result redirects', async () => {
		const fetcher = vi.fn();
		const cachedBootstrap = {
			configs: [],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Draft Shell'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			singletonContentIdentities: {},
			activeDraftBranch: 'tentman-preview',
			repositoryIdentity: createRepoIdentity('tentman-preview')
		};
		const refreshedBootstrap = {
			configs: [],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Published Shell'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			singletonContentIdentities: {},
			activeDraftBranch: null,
			repositoryIdentity: createRepoIdentity()
		};
		mocks.loadRepoConfigsBootstrap
			.mockResolvedValueOnce(cachedBootstrap)
			.mockResolvedValueOnce(refreshedBootstrap);

		await load({
			parent: async () => githubWorkspaceParentData,
			fetch: fetcher,
			url: new URL('http://localhost/pages')
		} as never);
		mocks.loadRepoConfigsBootstrap.mockClear();

		await expect(
			load({
				parent: async () => githubWorkspaceParentData,
				fetch: fetcher,
				url: new URL('http://localhost/pages?merged=true')
			} as never)
		).resolves.toMatchObject({
			rootConfig: {
				siteName: 'Published Shell'
			},
			activeDraftBranch: null,
			repositoryIdentity: createRepoIdentity()
		});
		expect(mocks.loadRepoConfigsBootstrap).toHaveBeenCalledWith(fetcher);
	});

	it('returns full parsed root config from repo bootstrap instead of the session summary', async () => {
		const fetcher = vi.fn();
		const fullRootConfig = {
			siteName: 'Acme Docs',
			assets: {
				path: './static/images/projects',
				publicPath: '/images/projects'
			}
		};
		mocks.loadRepoConfigsBootstrap.mockResolvedValueOnce({
			configs: [],
			blockConfigs: [],
			rootConfig: fullRootConfig,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
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
					selectedRepoConfigSummary: {
						siteName: 'Session Shell'
					}
				}),
				fetch: fetcher
			} as never)
		).toEqual({
			configs: [],
			blockConfigs: [],
			rootConfig: fullRootConfig,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			instructionDiscovery: emptyInstructionDiscovery
		});
	});

	it('shapes GitHub workspace data from the normalized workflow bootstrap when present', async () => {
		const fetcher = vi.fn();
		const workflowNavigationManifest = {
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1 as const,
				content: {
					items: ['posts']
				}
			},
			error: null
		};
		const workflowConfig = {
			slug: 'posts',
			path: 'content/posts.tentman.json',
			config: {
				label: 'Workflow Posts',
				collection: true,
				content: {
					mode: 'directory' as const
				},
				blocks: []
			}
		};
		mocks.loadRepoConfigsBootstrap.mockResolvedValueOnce({
			configs: [],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Legacy Shell'
			},
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			workflowData: {
				identity: null,
				rootConfig: {
					siteName: 'Workflow Shell'
				},
				configs: [workflowConfig],
				navigationManifest: workflowNavigationManifest,
				blockSupport: {
					blockConfigs: [],
					packageBlocks: [],
					error: null
				},
				changedContentPaths: ['content/posts/hello.md'],
				freshness: {
					identity: null,
					status: 'changed',
					unchanged: false,
					changedContentPaths: ['content/posts/hello.md'],
					error: null,
					recovery: null
				}
			}
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
					}
				}),
				fetch: fetcher
			} as never)
		).toMatchObject({
			configs: [workflowConfig],
			rootConfig: {
				siteName: 'Workflow Shell'
			},
			navigationManifest: workflowNavigationManifest,
			changedPaths: ['content/posts/hello.md'],
			freshnessStatus: 'changed',
			instructionDiscovery: emptyInstructionDiscovery
		});
	});

	it('returns empty configs when local mode is active, even if a stale GitHub repo snapshot exists', async () => {
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
						kind: 'local',
						repo: {
							name: 'Docs',
							pathLabel: '~/Sites/docs'
						}
					}
				}),
				fetch: vi.fn()
			} as never)
		).toEqual({
			...EMPTY_REPO_CONFIGS_BOOTSTRAP,
			instructionDiscovery: emptyInstructionDiscovery
		});
	});

	it('redirects to login when repo config bootstrap returns 401', async () => {
		mocks.loadRepoConfigsBootstrap.mockRejectedValueOnce({
			status: 401
		});

		await expect(
			load({
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
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages'
		});
	});
});
