import { describe, expect, it, vi } from 'vitest';
import {
	createPagesWorkspaceConsumer,
	resolvePagesWorkspaceSurface,
	type PagesWorkspaceAdapter
} from './pages-workspace-consumer';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';
import type { DiscoveredConfig } from '$lib/config/discovery';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';

const localConfig = {
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
} as unknown as DiscoveredConfig;

const workflowConfig = {
	slug: 'news',
	path: 'content/news.tentman.json',
	config: {
		label: 'News',
		collection: true,
		content: {
			mode: 'directory' as const
		},
		blocks: []
	}
} as unknown as DiscoveredConfig;

const localWorkflowConfig = {
	slug: 'guides',
	path: 'content/guides.tentman.json',
	config: {
		label: 'Guides',
		collection: true,
		content: {
			mode: 'directory' as const
		},
		blocks: []
	}
} as unknown as DiscoveredConfig;

const instructionDiscovery = {
	instructions: [
		{
			path: 'tentman/instructions/new',
			definition: {
				id: 'new-page',
				label: 'New page',
				description: 'Create a new page.',
				inputs: []
			},
			templates: []
		}
	],
	issues: []
} satisfies InstructionDiscoveryResult;

describe('pages workspace consumer', () => {
	it('resolves local workspace data from the local adapter state', () => {
		const surface = resolvePagesWorkspaceSurface({
			selectedBackend: {
				kind: 'local',
				repo: {
					name: 'Docs',
					pathLabel: '~/Docs'
				}
			},
			layoutData: {
				...EMPTY_REPO_CONFIGS_BOOTSTRAP,
				selectedBackend: null
			},
			localContent: {
				...EMPTY_REPO_CONFIGS_BOOTSTRAP,
				status: 'ready',
				configs: [localConfig],
				rootConfig: {
					siteName: 'Local Site'
				},
				instructionDiscovery
			}
		});

		expect(surface).toMatchObject({
			mode: 'local',
			capabilities: {
				canRefreshWorkspace: true,
				canClearCache: false,
				canWarmRoutes: false,
				canUseDraftBranches: false
			},
			configs: [localConfig],
			rootConfig: {
				siteName: 'Local Site'
			},
			canAddPage: true
		});
	});

	it('resolves GitHub workspace data from normalized workflow capabilities', () => {
		const surface = resolvePagesWorkspaceSurface({
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'main'
				}
			},
			layoutData: {
				...EMPTY_REPO_CONFIGS_BOOTSTRAP,
				selectedRepo: {
					full_name: 'acme/docs'
				},
				workflowData: {
					identity: {
						mode: 'github',
						workspaceKey: 'github:acme/docs',
						workspaceLabel: 'acme/docs',
						dataSetKey: 'dataset:abc',
						resolvedAt: 1,
						hasEditableDraft: true
					},
					configs: [workflowConfig],
					rootConfig: {
						siteName: 'Workflow Site'
					},
					navigationManifest: {
						path: 'tentman/navigation-manifest.json',
						exists: true,
						manifest: {
							version: 1,
							content: {
								items: [{ id: 'news' }]
							}
						},
						error: null
					},
					blockSupport: {
						blockConfigs: [],
						packageBlocks: [],
						error: null,
						readiness: 'ready',
						cacheMiss: null
					},
					changedContentPaths: [],
					freshness: {
						identity: null,
						status: 'unchanged',
						unchanged: true,
						changedContentPaths: [],
						error: null,
						recovery: null
					}
				},
				configs: [localConfig],
				rootConfig: {
					siteName: 'Legacy Site'
				},
				instructionDiscovery
			},
			localContent: {
				...EMPTY_REPO_CONFIGS_BOOTSTRAP,
				status: 'idle',
				instructionDiscovery: {
					instructions: [],
					issues: []
				}
			}
		});

		expect(surface).toMatchObject({
			mode: 'github',
			capabilities: {
				canRefreshWorkspace: false,
				canClearCache: true,
				canWarmRoutes: true,
				canUseDraftBranches: true
			},
			configs: [workflowConfig],
			rootConfig: {
				siteName: 'Workflow Site'
			},
			canAddPage: true
		});
	});

	it('resolves local workspace data from normalized workflow capabilities without GitHub mechanics', () => {
		const surface = resolvePagesWorkspaceSurface({
			selectedBackend: {
				kind: 'local',
				repo: {
					name: 'Docs',
					pathLabel: '~/Docs'
				}
			},
			layoutData: {
				...EMPTY_REPO_CONFIGS_BOOTSTRAP,
				selectedRepo: {
					full_name: 'acme/docs'
				},
				workflowData: {
					identity: {
						mode: 'github',
						workspaceKey: 'github:acme/docs',
						workspaceLabel: 'acme/docs',
						dataSetKey: 'dataset:stale',
						resolvedAt: 1,
						hasEditableDraft: true
					},
					configs: [workflowConfig],
					rootConfig: {
						siteName: 'Stale GitHub Site'
					},
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
					blockSupport: {
						blockConfigs: [],
						packageBlocks: [],
						error: null,
						readiness: 'ready',
						cacheMiss: null
					},
					changedContentPaths: ['github-only.md'],
					freshness: {
						identity: null,
						status: 'changed',
						unchanged: false,
						changedContentPaths: ['github-only.md'],
						error: null,
						recovery: null
					}
				}
			},
			localContent: {
				...EMPTY_REPO_CONFIGS_BOOTSTRAP,
				status: 'ready',
				configs: [localConfig],
				rootConfig: {
					siteName: 'Legacy Local Site'
				},
				workflowData: {
					identity: {
						mode: 'local',
						workspaceKey: 'local:docs',
						workspaceLabel: 'Docs',
						dataSetKey: 'dataset:local',
						resolvedAt: 2,
						hasEditableDraft: false
					},
					configs: [localWorkflowConfig],
					rootConfig: {
						siteName: 'Workflow Local Site'
					},
					navigationManifest: {
						path: 'tentman/navigation-manifest.json',
						exists: true,
						manifest: {
							version: 1,
							content: {
								items: [{ id: 'guides' }]
							}
						},
						error: null
					},
					blockSupport: {
						blockConfigs: [],
						packageBlocks: [],
						error: null,
						readiness: 'ready',
						cacheMiss: null
					},
					changedContentPaths: [],
					freshness: {
						identity: null,
						status: 'unchanged',
						unchanged: true,
						changedContentPaths: [],
						error: null,
						recovery: null
					}
				},
				instructionDiscovery
			}
		});

		expect(surface).toMatchObject({
			mode: 'local',
			capabilities: {
				canRefreshWorkspace: true,
				canClearCache: false,
				canWarmRoutes: false,
				canUseDraftBranches: false
			},
			configs: [localWorkflowConfig],
			rootConfig: {
				siteName: 'Workflow Local Site'
			},
			repoLabel: '~/Docs',
			canAddPage: true
		});
		expect(surface.navigationManifest.manifest).toEqual({
			version: 1,
			content: {
				items: [{ id: 'guides' }]
			}
		});
	});

	it('runs workspace user intents through adapter results', async () => {
		const adapter = {
			refreshWorkspace: vi.fn(async () => ({
				type: 'workspace-refreshed',
				message: 'Found 1 content config and 2 blocks.',
				remountWorkspace: true
			})),
			clearWorkspaceCache: vi.fn(async () => ({
				type: 'workspace-cache-cleared',
				message: 'GitHub cache cleared.',
				resetCollections: true,
				resetConfigStates: true
			})),
			loadCollectionNavigation: vi.fn(async () => ({
				type: 'collection-navigation-loaded',
				slug: 'posts',
				navigation: {
					items: [],
					groups: []
				}
			})),
			loadConfigStates: vi.fn(async () => ({
				type: 'config-states-loaded',
				statesBySlug: {}
			})),
			saveNavigation: vi.fn(async () => ({
				type: 'navigation-saved',
				message: 'Navigation saved.',
				branchName: 'tentman-draft',
				invalidateWorkspace: true
			})),
			saveCollectionOrder: vi.fn(async () => ({
				type: 'collection-order-saved',
				message: 'Posts order saved.',
				slug: 'posts',
				invalidateWorkspace: true
			})),
			promoteRoute: vi.fn(() => ({
				type: 'route-promoted'
			})),
			promoteCollectionItem: vi.fn(() => ({
				type: 'route-promoted'
			})),
			switchWorkspace: vi.fn(async () => ({
				type: 'workspace-switched'
			})),
			startWorkspace: vi.fn(async () => ({
				type: 'workspace-started'
			})),
			stopWorkspace: vi.fn(() => {}),
			watchCollectionNavigation: vi.fn(() => () => {})
		} as unknown as PagesWorkspaceAdapter;

		const consumer = createPagesWorkspaceConsumer(adapter);

		await expect(consumer.run({ type: 'refresh-workspace' })).resolves.toMatchObject({
			type: 'workspace-refreshed',
			remountWorkspace: true
		});
		await expect(consumer.run({ type: 'clear-workspace-cache' })).resolves.toMatchObject({
			type: 'workspace-cache-cleared',
			resetCollections: true
		});
		await expect(
			consumer.run({ type: 'load-collection-navigation', config: workflowConfig })
		).resolves.toMatchObject({
			type: 'collection-navigation-loaded',
			slug: 'posts'
		});
		await expect(
			consumer.run({ type: 'promote-collection-item', slug: 'posts', itemId: 'hello' })
		).resolves.toMatchObject({
			type: 'route-promoted'
		});

		expect(adapter.refreshWorkspace).toHaveBeenCalledOnce();
		expect(adapter.clearWorkspaceCache).toHaveBeenCalledOnce();
		expect(adapter.loadCollectionNavigation).toHaveBeenCalledWith({
			config: workflowConfig,
			force: undefined,
			hydrateRemaining: undefined
		});
		expect(adapter.promoteCollectionItem).toHaveBeenCalledWith({
			slug: 'posts',
			itemId: 'hello'
		});
	});
});
