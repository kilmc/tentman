import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { load } from './+layout';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

const emptyInstructionDiscovery = {
	instructions: [],
	issues: []
};

describe('routes/pages/+layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
