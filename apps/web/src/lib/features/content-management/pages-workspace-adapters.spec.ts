import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';
import {
	createPagesWorkspaceAdapter,
	shouldInvalidatePagesWorkspaceData,
	type PagesWorkspaceAdapterContext
} from './pages-workspace-adapters';

const githubRepositoryCacheMock = vi.hoisted(() => ({
	hydrateFromBootstrap: vi.fn(),
	startFreshnessScheduler: vi.fn(() => vi.fn()),
	clearRepoRef: vi.fn(),
	resetFreshnessSchedule: vi.fn(),
	getCollectionNavigation: vi.fn(),
	warmCollection: vi.fn(),
	invalidatePaths: vi.fn(),
	promoteRoute: vi.fn(),
	onCollectionChange: vi.fn()
}));

const draftBranchMock = vi.hoisted(() => ({
	setBranch: vi.fn(),
	hasDraft: vi.fn(() => false),
	clear: vi.fn()
}));

const localMocks = vi.hoisted(() => {
	const backend = {
		kind: 'local' as const,
		cacheKey: 'local:docs',
		label: 'Docs',
		supportsDraftBranches: false
	};
	const state = {
		status: 'ready' as const,
		configs: [],
		blockConfigs: [],
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1 as const,
				content: {
					items: []
				}
			},
			error: null
		},
		rootConfig: null,
		blockRegistryError: null,
		discoverySignature: {
			rootConfigText: null,
			navigationManifestText: null,
			contentConfigPaths: [],
			contentConfigFiles: [],
			blockConfigPaths: [],
			blockConfigFiles: [],
			contentComponentFiles: []
		},
		error: null
	};
	type Subscriber = (value: typeof state) => void;
	const subscribers = new Set<Subscriber>();

	return {
		backend,
		fetchContentDocument: vi.fn(async (): Promise<unknown[]> => []),
		writeNavigationManifest: vi.fn(),
		saveCollectionOrder: vi.fn(),
		localRepo: {
			subscribe(subscriber: (value: { backend: typeof backend }) => void) {
				subscriber({ backend });
				return () => {};
			},
			clear: vi.fn()
		},
		localContent: {
			subscribe(subscriber: Subscriber) {
				subscriber(state);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			},
			refresh: vi.fn(async () => {
				for (const subscriber of subscribers) {
					subscriber(state);
				}
			}),
			reset: vi.fn()
		}
	};
});

vi.mock('$lib/stores/github-repository-cache', () => ({
	githubRepositoryCache: githubRepositoryCacheMock
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: draftBranchMock
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: localMocks.localRepo
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: localMocks.localContent
}));

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	writeNavigationManifest: localMocks.writeNavigationManifest,
	saveCollectionOrder: localMocks.saveCollectionOrder
}));

vi.mock('$lib/content/service', () => ({
	fetchContentDocument: localMocks.fetchContentDocument
}));

function createGitHubContext(fetcher: typeof fetch): PagesWorkspaceAdapterContext {
	return {
		mode: 'github',
		fetcher,
		selectedRepo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		},
		repositoryIdentity: {
			ref: 'main'
		},
		activeDraftBranch: null,
		bootstrap: EMPTY_REPO_CONFIGS_BOOTSTRAP,
		getConfigs: () => [],
		getNavigationManifest: () => null,
		getRootConfig: () => null,
		getCurrentConfig: () => null,
		getRoutePath: () => '/pages',
		redirectToExpiredSession: vi.fn(),
		switchToRepos: vi.fn(),
		resolveEndpoint: (path) => `/base${path}`
	};
}

const localCollectionConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		type: 'content' as const,
		label: 'Posts',
		collection: true,
		content: {
			mode: 'file' as const,
			path: 'src/content/posts.json'
		},
		blocks: [
			{
				id: 'title',
				type: 'text' as const,
				label: 'Title'
			}
		]
	}
};

function createLocalContext(fetcher: typeof fetch): PagesWorkspaceAdapterContext {
	return {
		mode: 'local',
		fetcher,
		selectedRepo: null,
		repositoryIdentity: null,
		activeDraftBranch: null,
		bootstrap: EMPTY_REPO_CONFIGS_BOOTSTRAP,
		getConfigs: () => [],
		getNavigationManifest: () => ({
			version: 1,
			content: {
				items: []
			}
		}),
		getRootConfig: () => null,
		getCurrentConfig: () => null,
		getRoutePath: () => '/pages',
		redirectToExpiredSession: vi.fn(),
		switchToRepos: vi.fn(),
		resolveEndpoint: (path) => `/base${path}`
	};
}

describe('pages workspace adapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps GitHub page data invalidation behind the adapter predicate', () => {
		expect(
			shouldInvalidatePagesWorkspaceData(new URL('https://tentman.test/api/repo/config-states'))
		).toBe(true);
		expect(shouldInvalidatePagesWorkspaceData(new URL('https://tentman.test/api/repo/blob'))).toBe(
			false
		);
	});

	it('saves GitHub navigation as an adapter result and invalidates manifest cache', async () => {
		const fetcher = vi.fn(async () => {
			return new Response(JSON.stringify({ branchName: 'tentman-draft' }), { status: 200 });
		}) as unknown as typeof fetch;
		const adapter = createPagesWorkspaceAdapter(createGitHubContext(fetcher));

		const result = await adapter.saveNavigation({
			manifest: {
				version: 1,
				content: {
					items: []
				}
			}
		});

		expect(result).toMatchObject({
			type: 'navigation-saved',
			message: 'Navigation saved.',
			branchName: 'tentman-draft',
			invalidateWorkspace: true,
			mutation: {
				mode: 'github',
				intent: {
					type: 'save-navigation-manifest'
				},
				outcome: 'success',
				changedPaths: ['tentman/navigation-manifest.json'],
				refresh: {
					workspace: true,
					navigationManifest: true
				}
			}
		});
		expect(fetcher).toHaveBeenCalledWith(
			'/base/api/repo/navigation-manifest',
			expect.objectContaining({
				method: 'POST'
			})
		);
		expect(githubRepositoryCacheMock.invalidatePaths).toHaveBeenCalledWith([
			'tentman/navigation-manifest.json'
		]);
		expect(draftBranchMock.setBranch).toHaveBeenCalledWith('tentman-draft', 'acme/docs');
	});

	it('rescans local workspaces through local content without warming GitHub caches', async () => {
		const fetcher = vi.fn() as unknown as typeof fetch;
		const adapter = createPagesWorkspaceAdapter(createLocalContext(fetcher));

		const result = await adapter.refreshWorkspace();

		expect(result).toMatchObject({
			type: 'workspace-refreshed',
			message: 'Found 0 content configs and 0 blocks.',
			remountWorkspace: true
		});
		expect(localMocks.localContent.refresh).toHaveBeenCalledWith({ force: true });
		expect(fetcher).not.toHaveBeenCalled();
		expect(githubRepositoryCacheMock.hydrateFromBootstrap).not.toHaveBeenCalled();
		expect(githubRepositoryCacheMock.startFreshnessScheduler).not.toHaveBeenCalled();
	});

	it('loads local collection navigation with workflow route data', async () => {
		localMocks.fetchContentDocument.mockResolvedValueOnce([
			{
				_tentmanId: 'tent_hello',
				title: 'Hello'
			}
		]);
		const fetcher = vi.fn() as unknown as typeof fetch;
		const adapter = createPagesWorkspaceAdapter(createLocalContext(fetcher));

		const result = await adapter.loadCollectionNavigation({
			config: localCollectionConfig
		});

		expect(result).toMatchObject({
			type: 'collection-navigation-loaded',
			slug: 'posts',
			workflowData: {
				identity: {
					mode: 'local',
					workspaceKey: 'local:docs',
					hasEditableDraft: false
				},
				slug: 'posts',
				readiness: 'ready'
			}
		});
		expect(fetcher).not.toHaveBeenCalled();
		expect(githubRepositoryCacheMock.warmCollection).not.toHaveBeenCalled();
	});

	it('loads local config states with workflow route data', async () => {
		const fetcher = vi.fn() as unknown as typeof fetch;
		const adapter = createPagesWorkspaceAdapter({
			...createLocalContext(fetcher),
			getConfigs: () => []
		});

		const result = await adapter.loadConfigStates();

		expect(result).toMatchObject({
			type: 'config-states-loaded',
			statesBySlug: {},
			workflowData: {
				identity: {
					mode: 'local',
					workspaceKey: 'local:docs',
					hasEditableDraft: false
				},
				statesBySlug: {},
				stateConfigCount: 0,
				readiness: 'ready'
			}
		});
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('saves local navigation through direct local writes without draft branches', async () => {
		const fetcher = vi.fn() as unknown as typeof fetch;
		const adapter = createPagesWorkspaceAdapter(createLocalContext(fetcher));
		const manifest = {
			version: 1 as const,
			content: {
				items: []
			}
		};

		const result = await adapter.saveNavigation({ manifest });

		expect(result).toMatchObject({
			type: 'navigation-saved',
			message: 'Navigation saved.',
			invalidateWorkspace: true,
			mutation: {
				mode: 'local',
				intent: {
					type: 'save-navigation-manifest'
				},
				changedPaths: ['tentman/navigation-manifest.json'],
				refresh: {
					workspace: true,
					remountWorkspace: true,
					navigationManifest: true,
					configStates: true
				}
			},
			localCollections: {},
			localConfigStates: {}
		});
		expect(localMocks.writeNavigationManifest).toHaveBeenCalledWith(localMocks.backend, manifest, {
			message: 'Update Tentman navigation manifest'
		});
		expect(localMocks.localContent.refresh).toHaveBeenCalledWith({ force: true });
		expect(fetcher).not.toHaveBeenCalled();
		expect(githubRepositoryCacheMock.invalidatePaths).not.toHaveBeenCalled();
		expect(draftBranchMock.setBranch).not.toHaveBeenCalled();
	});
});
