import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	githubCacheInventoryStatus,
	githubCacheWorkObservabilityStatus,
	githubCacheWarmDebugStatus,
	githubCacheWarmStatus,
	githubRepositoryCache,
	githubRepositoryCacheTestApi
} from '$lib/stores/github-repository-cache';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import {
	assertWorkflowRequestBudgetForTests,
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';

type TestCollectionIndexItem = {
	itemId: string;
	route: string;
	path: string;
	filename: string;
	blobSha: string;
	title: string;
	sortDate: number | null;
	hydration: 'fallback' | 'hydrated';
	hrefItemId: string;
};
type MutableIdleWindow = {
	requestIdleCallback?: typeof window.requestIdleCallback;
	cancelIdleCallback?: typeof window.cancelIdleCallback;
};

function createBootstrap(treeSha = 'tree-main', ref = 'main'): RepoConfigsBootstrap {
	return {
		isAuthenticated: true,
		githubOAuthConfigured: true,
		user: null,
		recentRepos: [],
		selectedBackend: {
			kind: 'github',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			}
		},
		selectedRepo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		},
		activeDraftBranch: null,
		repositoryIdentity: {
			repoKey: `github:acme/docs?ref=${ref}`,
			mode: 'github',
			label: 'acme/docs',
			ref,
			headSha: 'head-main',
			treeSha,
			resolvedAt: 1
		},
		configs: [
			createCollectionConfig('posts', 'Posts', 'src/content/posts'),
			createCollectionConfig('notes', 'Notes', 'src/content/notes')
		],
		blockConfigs: [],
		rootConfig: null,
		singletonContentIdentities: {},
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		}
	} as RepoConfigsBootstrap;
}

function createCollectionConfig(slug: string, label: string, contentPath: string) {
	return {
		slug,
		path: `tentman/configs/${slug}.tentman.json`,
		config: {
			type: 'content',
			label,
			collection: true,
			content: {
				mode: 'directory',
				path: `../../${contentPath}`,
				template: `../../${contentPath}/_template.md`
			},
			blocks: []
		}
	};
}

function createSingletonConfig(slug: string, label: string, contentPath: string) {
	return {
		slug,
		path: `tentman/configs/${slug}.tentman.json`,
		config: {
			type: 'content',
			label,
			collection: false,
			content: {
				mode: 'file',
				path: `../../${contentPath}`
			},
			blocks: []
		}
	};
}

function createIndexPayload(treeSha = 'tree-main') {
	return createIndexPayloadWithItems([
		{
			itemId: 'hello-world',
			route: 'hello-world',
			path: 'src/content/posts/hello-world.md',
			filename: 'hello-world.md',
			blobSha: 'blob-hello',
			title: 'hello world',
			sortDate: null,
			hydration: 'fallback' as const,
			hrefItemId: 'hello-world'
		}
	], treeSha);
}

function createNotesIndexPayload(treeSha = 'tree-main') {
	return createIndexPayloadWithItems(
		[
			{
				itemId: 'field-note',
				route: 'field-note',
				path: 'src/content/notes/field-note.md',
				filename: 'field-note.md',
				blobSha: 'blob-note',
				title: 'field note',
				sortDate: null,
				hydration: 'fallback' as const,
				hrefItemId: 'field-note'
			}
		],
		treeSha,
		'notes',
		'src/content/notes'
	);
}

function createIndexPayloadWithItems(
	items: TestCollectionIndexItem[],
	treeSha = 'tree-main',
	slug = 'posts',
	contentPath = 'src/content/posts'
) {
	return {
		identity: {
			repoKey: 'github:acme/docs?ref=main',
			ref: 'main',
			headSha: 'head-main',
			treeSha,
			configSlug: slug,
			configPath: `tentman/configs/${slug}.tentman.json`,
			contentIdentity: `${contentPath}:${contentPath}/_template.md`,
			schemaIdentity: 'title'
		},
		configSlug: slug,
		mode: 'directory' as const,
		items
	};
}

function createIndexPayloadForRef(items: TestCollectionIndexItem[], ref: string, treeSha = 'tree-main') {
	return {
		...createIndexPayloadWithItems(items, treeSha),
		identity: {
			...createIndexPayload(treeSha).identity,
			repoKey: `github:acme/docs?ref=${ref}`,
			ref
		}
	};
}

function createFallbackItems(count: number) {
	return Array.from({ length: count }, (_, index) => {
		const itemNumber = index + 1;
		return {
			itemId: `post-${itemNumber}`,
			route: `post-${itemNumber}`,
			path: `src/content/posts/post-${itemNumber}.md`,
			filename: `post-${itemNumber}.md`,
			blobSha: `blob-${itemNumber}`,
			title: `post ${itemNumber}`,
			sortDate: null,
			hydration: 'fallback' as const,
			hrefItemId: `post-${itemNumber}`
		};
	});
}

function createProjectionItems(blobShas: string[]) {
	return blobShas.map((blobSha) => {
		const itemNumber = blobSha.replace('blob-', '');
		return {
			itemId: `stable-${itemNumber}`,
			route: `post-${itemNumber}`,
			path: `src/content/posts/post-${itemNumber}.md`,
			filename: `post-${itemNumber}.md`,
			blobSha,
			title: `Post ${itemNumber}`,
			sortDate: null,
			hydration: 'hydrated' as const,
			hrefItemId: `post-${itemNumber}`
		};
	});
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		resolve,
		reject
	};
}

describe('githubRepositoryCache IndexedDB records', () => {
	let originalRequestIdleCallback: typeof window.requestIdleCallback | undefined;
	let originalCancelIdleCallback: typeof window.cancelIdleCallback | undefined;

	beforeEach(async () => {
		const idleWindow = window as unknown as MutableIdleWindow;
		clearWorkflowInstrumentationEventsForTests();
		originalRequestIdleCallback = window.requestIdleCallback;
		originalCancelIdleCallback = window.cancelIdleCallback;
		idleWindow.requestIdleCallback = ((callback: IdleRequestCallback) => {
			queueMicrotask(() =>
				callback({
					didTimeout: false,
					timeRemaining: () => 50
				})
			);
			return 1;
		}) as typeof window.requestIdleCallback;
		idleWindow.cancelIdleCallback = vi.fn() as typeof window.cancelIdleCallback;
		await githubRepositoryCacheTestApi.reset();
	});

	afterEach(async () => {
		const idleWindow = window as unknown as MutableIdleWindow;
		await githubRepositoryCacheTestApi.reset();
		if (originalRequestIdleCallback) {
			idleWindow.requestIdleCallback = originalRequestIdleCallback;
		} else {
			delete idleWindow.requestIdleCallback;
		}
		if (originalCancelIdleCallback) {
			idleWindow.cancelIdleCallback = originalCancelIdleCallback;
		} else {
			delete idleWindow.cancelIdleCallback;
		}
	});

	it('serializes snapshot and collection index records by repository tree identity', async () => {
		const fetcher = vi.fn(async () => Response.json(createIndexPayload()));

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		expect(get(githubCacheInventoryStatus)).toMatchObject({
			repoFullName: 'acme/docs',
			activeRef: 'main',
			totalTargets: 4,
			cachedTargets: 1,
			missingTargets: 3
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		expect(get(githubCacheWorkObservabilityStatus).current).toMatchObject({
			state: 'completed',
			operation: 'collection-index-warming',
			label: 'Posts'
		});
		expect(get(githubCacheWorkObservabilityStatus).recent[0]).toMatchObject({
			result: 'completed',
			operation: 'collection-index-warming',
			label: 'Posts'
		});

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [
				{
					itemId: 'hello-world',
					title: 'hello world',
					hydration: 'fallback'
				}
			]
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(get(githubCacheInventoryStatus)).toMatchObject({
			totalTargets: 6,
			cachedTargets: 2,
			missingTargets: 4
		});
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({
			status: 'fresh',
			path: 'tentman/configs/posts.tentman.json',
			activeRef: 'main',
			mainHeadSha: 'head-main',
			mainTreeSha: 'tree-main',
			draftHeadSha: null,
			draftTreeSha: null
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-next')
		});

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
	});

	it('restores durable inventory rows after an in-memory reload', async () => {
		const fetcher = vi.fn(async () => Response.json(createIndexPayload()));
		const bootstrap = createBootstrap();

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		const beforeReload = get(githubCacheInventoryStatus);
		expect(beforeReload).toMatchObject({
			totalTargets: 6,
			cachedTargets: 2,
			missingTargets: 4
		});

		githubRepositoryCacheTestApi.resetMemoryForReloadTests();
		expect(get(githubCacheInventoryStatus)).toMatchObject({
			totalTargets: 0,
			repoFullName: null
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		const afterReload = get(githubCacheInventoryStatus);
		expect(afterReload).toMatchObject({
			repoFullName: 'acme/docs',
			activeRef: 'main',
			totalTargets: 6,
			cachedTargets: 2,
			missingTargets: 4
		});
		expect(afterReload.records.map((record) => [record.targetId, record.status])).toEqual(
			beforeReload.records.map((record) => [record.targetId, record.status])
		);
	});

	it('serializes projections and resolves item documents through hydrated and fallback identities', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}

			const body = JSON.parse(String(init?.body));
			expect(body).toEqual({
				slug: 'posts',
				blobShas: ['blob-hello']
			});

			return Response.json({
				indexIdentity: createIndexPayload().identity,
				items: [
					{
						itemId: 'stable-hello',
						route: 'hello-world',
						path: 'src/content/posts/hello-world.md',
						filename: 'hello-world.md',
						blobSha: 'blob-hello',
						title: 'Hello world',
						sortDate: null,
						hydration: 'hydrated',
						hrefItemId: 'hello-world'
					}
				]
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 1
		});

		await expect(githubRepositoryCacheTestApi.getCollectionIndexItem('posts', 'stable-hello')).resolves
			.toMatchObject({
				itemId: 'stable-hello',
				blobSha: 'blob-hello'
			});
		await expect(githubRepositoryCacheTestApi.getCollectionIndexItem('posts', 'hello-world')).resolves
			.toMatchObject({
				itemId: 'stable-hello',
				blobSha: 'blob-hello'
			});

		await githubRepositoryCache.setItemDocumentForRoute({
			slug: 'posts',
			itemId: 'stable-hello',
			content: {
				title: 'Hello world',
				body: 'Full body'
			}
		});

		await expect(githubRepositoryCache.getItemDocumentForRoute({ slug: 'posts', itemId: 'hello-world' }))
			.resolves.toMatchObject({
				content: {
					title: 'Hello world',
					body: 'Full body'
				},
				indexItem: {
					blobSha: 'blob-hello'
				}
			});

		await githubRepositoryCache.invalidatePaths(['src/content/posts/hello-world.md']);

		await expect(
			githubRepositoryCache.getItemDocumentForRoute({ slug: 'posts', itemId: 'hello-world' })
		).resolves.toBeNull();
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
	});

	it('notifies fallback rows before projection hydration completes', async () => {
		const projectionResponse = createDeferred<Response>();
		const observedTitles: string[][] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(2)));
			}

			return projectionResponse.promise;
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		const unsubscribe = githubRepositoryCache.onCollectionChange('posts', (navigation) => {
			observedTitles.push(navigation?.items.map((item) => item.title) ?? []);
		});

		const warmPromise = githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 2
		});

		await expect.poll(() => observedTitles.length).toBe(1);
		expect(observedTitles[0]).toEqual(['post 1', 'post 2']);

		projectionResponse.resolve(
			Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(['blob-1', 'blob-2'])
			})
		);
		await warmPromise;

		await expect.poll(() => observedTitles.at(-1)).toEqual(['Post 1', 'Post 2']);
		unsubscribe();
	});

	it('hydrates visible projection titles before background rows', async () => {
		const fallbackItems = createFallbackItems(4);
		const backgroundResponse = createDeferred<Response>();
		const projectionCalls: string[][] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(fallbackItems));
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			projectionCalls.push(body.blobShas);
			if (projectionCalls.length === 1) {
				return Response.json({
					indexIdentity: createIndexPayload().identity,
					items: createProjectionItems(body.blobShas)
				});
			}

			return backgroundResponse.promise;
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 2
		});

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [
				{ title: 'Post 1', hydration: 'hydrated' },
				{ title: 'Post 2', hydration: 'hydrated' },
				{ title: 'post 3', hydration: 'fallback' },
				{ title: 'post 4', hydration: 'fallback' }
			]
		});

		await expect.poll(() => projectionCalls).toEqual([
			['blob-1', 'blob-2'],
			['blob-3', 'blob-4']
		]);
		backgroundResponse.resolve(
			Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(['blob-3', 'blob-4'])
			})
		);

		await expect.poll(async () => {
			const navigation = await githubRepositoryCache.getCollectionNavigation('posts');
			return navigation?.items.map((item) => item.title);
		}).toEqual(['Post 1', 'Post 2', 'Post 3', 'Post 4']);
	});

	it('queues remaining projection hydration behind idle after visible route readiness', async () => {
		const idleCallbacks: IdleRequestCallback[] = [];
		const idleWindow = window as unknown as MutableIdleWindow;
		idleWindow.requestIdleCallback = ((callback: IdleRequestCallback) => {
			idleCallbacks.push(callback);
			return idleCallbacks.length;
		}) as typeof window.requestIdleCallback;

		const fallbackItems = createFallbackItems(4);
		const backgroundResponse = createDeferred<Response>();
		const projectionCalls: string[][] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(fallbackItems));
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			projectionCalls.push(body.blobShas);
			if (projectionCalls.length === 1) {
				return Response.json({
					indexIdentity: createIndexPayload().identity,
					items: createProjectionItems(body.blobShas)
				});
			}

			return backgroundResponse.promise;
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 2,
			warmDocuments: false
		});

		expect(projectionCalls).toEqual([['blob-1', 'blob-2']]);
		expect(get(githubCacheWarmDebugStatus).taskKinds.collectionProjectionBatch.total).toBe(1);
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'cache-work',
					phase: 'queued',
					operation: 'projection-hydration',
					workflow: 'desktop-collection-landing',
					route: '/pages/posts',
					repoFullName: 'acme/docs',
					ref: 'main',
					taskKind: 'collectionProjectionBatch',
					priority: 'passive',
					progressCompleted: 4,
					progressTotal: 12,
					queuedTasks: 1,
					runningTasks: 0,
					reason: 'queued cache task'
				})
			])
		);
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [
				{ title: 'Post 1', hydration: 'hydrated' },
				{ title: 'Post 2', hydration: 'hydrated' },
				{ title: 'post 3', hydration: 'fallback' },
				{ title: 'post 4', hydration: 'fallback' }
			]
		});

		expect(idleCallbacks.length).toBeGreaterThan(0);
		for (const callback of idleCallbacks) {
			callback({ didTimeout: false, timeRemaining: () => 50 });
		}
		await expect.poll(() => projectionCalls).toEqual([
			['blob-1', 'blob-2'],
			['blob-3', 'blob-4']
		]);
		backgroundResponse.resolve(
			Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(['blob-3', 'blob-4'])
			})
		);
		await expect.poll(async () => {
			const navigation = await githubRepositoryCache.getCollectionNavigation('posts');
			return navigation?.items.map((item) => item.title);
		}).toEqual(['Post 1', 'Post 2', 'Post 3', 'Post 4']);
	});

	it('loads collection route workflow data with one index request and one visible projection batch', async () => {
		const fallbackItems = createFallbackItems(3);
		const fetchedEndpoints: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			fetchedEndpoints.push(url);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(fallbackItems));
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
				expect(body.blobShas).toEqual(['blob-1', 'blob-2']);
				return Response.json({
					indexIdentity: createIndexPayload().identity,
					items: createProjectionItems(body.blobShas)
				});
			}
			throw new Error(`Unexpected foreground collection route fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		clearWorkflowInstrumentationEventsForTests();

		const workflowData = await githubRepositoryCache.loadCollectionNavigationWorkflowData('posts', {
			fetcher,
			visibleLimit: 2
		});

		expect(workflowData).toMatchObject({
			slug: 'posts',
			readiness: 'ready',
			cacheMiss: null,
			identity: {
				mode: 'github',
				workspaceKey: 'github:acme/docs?ref=main',
				workspaceLabel: 'acme/docs'
			},
			navigation: {
				items: [
					{ title: 'Post 1', hydration: 'hydrated' },
					{ title: 'Post 2', hydration: 'hydrated' },
					{ title: 'post 3', hydration: 'fallback' }
				]
			}
		});
		expect(fetchedEndpoints).toEqual([
			'/api/repo/collection-index?slug=posts',
			'/api/repo/collection-projections'
		]);
		expect(fetchedEndpoints).not.toEqual(
			expect.arrayContaining(['/api/repo/page-view?slug=posts', '/api/repo/item-view'])
		);
		assertWorkflowRequestBudgetForTests({
			workflow: 'desktop-collection-landing',
			route: '/pages/posts',
			maxBrowserRequests: 2,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 2
		});
	});

	it('reloads matching collection route workflow data from cached identities without foreground calls', async () => {
		const fallbackItems = createFallbackItems(1);
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(fallbackItems));
			}
			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(body.blobShas)
			});
		});
		const bootstrap = createBootstrap();

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		await githubRepositoryCache.loadCollectionNavigationWorkflowData('posts', {
			fetcher,
			visibleLimit: 1
		});

		githubRepositoryCacheTestApi.resetMemoryForReloadTests();
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		fetcher.mockClear();
		clearWorkflowInstrumentationEventsForTests();

		const workflowData = await githubRepositoryCache.loadCollectionNavigationWorkflowData('posts', {
			fetcher,
			visibleLimit: 1
		});

		expect(workflowData).toMatchObject({
			readiness: 'ready',
			cacheMiss: null,
			navigation: {
				items: [{ title: 'Post 1', hydration: 'hydrated' }]
			}
		});
		expect(fetcher).not.toHaveBeenCalled();
		assertWorkflowRequestBudgetForTests({
			workflow: 'warm-collection-reload',
			route: '/pages/posts',
			maxBrowserRequests: 0,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 0
		});
	});

	it('returns degraded collection workflow data when route cache records fail to load', async () => {
		const fetcher = vi.fn(async () => new Response(null, { status: 503 }));

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		const workflowData = await githubRepositoryCache.loadCollectionNavigationWorkflowData('posts', {
			fetcher,
			visibleLimit: 2
		});

		expect(workflowData).toMatchObject({
			slug: 'posts',
			readiness: 'error',
			navigation: {
				items: [],
				groups: []
			},
			cacheMiss: {
				target: 'collection-navigation',
				slug: 'posts',
				readiness: 'error',
				reason: 'collection index request failed (503)',
				recovery: 'fetch-route-data'
			}
		});
	});

	it('names projection failures in degraded collection workflow data', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(1)));
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				return new Response(null, { status: 502 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		const workflowData = await githubRepositoryCache.loadCollectionNavigationWorkflowData('posts', {
			fetcher,
			visibleLimit: 1
		});

		expect(workflowData).toMatchObject({
			readiness: 'error',
			cacheMiss: {
				reason: 'collection projection batch request failed (502)'
			}
		});
	});

	it('logs exact collection route cache miss reasons', async () => {
		const fetcher = vi.fn(async () => Response.json(createIndexPayload()));

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		clearWorkflowInstrumentationEventsForTests();
		await githubRepositoryCache.getCollectionNavigation('posts');
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'cache-outcome',
					cacheArea: 'collection-index',
					outcome: 'miss',
					reason: 'missing record',
					slug: 'posts'
				})
			])
		);

		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-next')
		});
		clearWorkflowInstrumentationEventsForTests();
		await githubRepositoryCache.getCollectionNavigation('posts');
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'cache-outcome',
					cacheArea: 'collection-index',
					outcome: 'miss',
					reason: 'stale identity',
					slug: 'posts'
				})
			])
		);
	});

	it('logs exact projection cache miss reasons for schema and blob identity mismatches', async () => {
		const [item] = createFallbackItems(1);
		const basePayload = createIndexPayloadWithItems([item]);
		const createFetcher = (payload: ReturnType<typeof createIndexPayloadWithItems>) =>
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith('/api/repo/collection-index')) {
					return Response.json(payload);
				}

				const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
				return Response.json({
					indexIdentity: payload.identity,
					items: createProjectionItems(body.blobShas)
				});
			});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		const baseFetcher = createFetcher(basePayload);
		await githubRepositoryCache.warmCollection('posts', {
			fetcher: baseFetcher,
			visibleLimit: 1,
			hydrateRemaining: false,
			warmDocuments: false
		});
		const schemaPayload = {
			...basePayload,
			identity: {
				...basePayload.identity,
				schemaIdentity: 'summary'
			}
		};
		const schemaFetcher = createFetcher(schemaPayload);
		await githubRepositoryCache.ensureCollectionIndex('posts', {
			fetcher: schemaFetcher,
			force: true
		});

		clearWorkflowInstrumentationEventsForTests();
		await githubRepositoryCache.warmCollection('posts', {
			fetcher: schemaFetcher,
			visibleLimit: 1,
			hydrateRemaining: false,
			warmDocuments: false
		});
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'cache-outcome',
					cacheArea: 'projection',
					outcome: 'miss',
					reason: 'schema mismatch',
					slug: 'posts'
				})
			])
		);

		await githubRepositoryCacheTestApi.reset();
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher: baseFetcher,
			visibleLimit: 1,
			hydrateRemaining: false,
			warmDocuments: false
		});
		const blobPayload = createIndexPayloadWithItems([{ ...item, blobSha: 'blob-new' }]);
		const blobFetcher = createFetcher(blobPayload);
		await githubRepositoryCache.ensureCollectionIndex('posts', {
			fetcher: blobFetcher,
			force: true
		});

		clearWorkflowInstrumentationEventsForTests();
		await githubRepositoryCache.warmCollection('posts', {
			fetcher: blobFetcher,
			visibleLimit: 1,
			hydrateRemaining: false,
			warmDocuments: false
		});
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'cache-outcome',
					cacheArea: 'projection',
					outcome: 'miss',
					reason: 'blob identity mismatch',
					slug: 'posts'
				})
			])
		);
	});

	it('stales the repository snapshot without clearing collection indexes for navigation changes', async () => {
		const fetcher = vi.fn(async () => Response.json(createIndexPayload()));

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});

		await githubRepositoryCache.invalidatePaths(['tentman/navigation-manifest.json']);

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});
		await expect(githubRepositoryCacheTestApi.getCollectionIndex('posts')).resolves.not.toBeNull();
		expect(
			get(githubCacheInventoryStatus).records.find((record) => record.targetId === 'snapshot')
		).toMatchObject({ status: 'stale' });
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'fresh' });
	});

	it('clears a collection index when a new file appears inside its content directory', async () => {
		const fetcher = vi.fn(async () => Response.json(createIndexPayload()));

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});

		await githubRepositoryCache.invalidatePaths(['src/content/posts/new-post.md']);

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
		await expect(githubRepositoryCacheTestApi.getCollectionIndex('posts')).resolves.toBeNull();
	});

	it('preserves unaffected collection indexes when invalidating one item path', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('slug=posts')) {
				return Response.json(createIndexPayload());
			}
			if (url.includes('slug=notes')) {
				return Response.json(createNotesIndexPayload());
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		await githubRepositoryCache.ensureCollectionIndex('notes', { fetcher });

		await githubRepositoryCache.invalidatePaths(['src/content/posts/hello-world.md']);

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
		await expect(githubRepositoryCache.getCollectionNavigation('notes')).resolves.toMatchObject({
			items: [{ itemId: 'field-note' }]
		});
	});

	it('stales only targets owned by a changed collection config', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('slug=posts')) {
				return Response.json(createIndexPayload());
			}
			if (url.includes('slug=notes')) {
				return Response.json(createNotesIndexPayload());
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		await githubRepositoryCache.ensureCollectionIndex('notes', { fetcher });

		await githubRepositoryCache.invalidatePaths(['tentman/configs/posts.tentman.json']);

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
		await expect(githubRepositoryCache.getCollectionNavigation('notes')).resolves.toMatchObject({
			items: [{ itemId: 'field-note' }]
		});
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'stale' });
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:notes'
			)
		).toMatchObject({ status: 'fresh' });
	});

	it('stales and clears a singleton document when its content path changes', async () => {
		const bootstrap = {
			...createBootstrap(),
			configs: [createSingletonConfig('about', 'About', 'src/content/about.md')],
			singletonContentIdentities: {
				about: {
					path: 'src/content/about.md',
					blobSha: 'blob-about'
				}
			}
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async () =>
			Response.json({
				content: {
					title: 'About'
				},
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null
			})
		);

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		await githubRepositoryCache.warmSingletonDocumentRoute({
			slug: 'about',
			fetcher,
			priority: 'foreground'
		});

		await expect(githubRepositoryCache.getSingletonDocumentForRoute({ slug: 'about' })).resolves
			.toMatchObject({
				content: { title: 'About' }
			});

		await githubRepositoryCache.invalidatePaths(['src/content/about.md']);

		await expect(githubRepositoryCache.getSingletonDocumentForRoute({ slug: 'about' })).resolves
			.toBeNull();
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'singletonDocument:about'
			)
		).toMatchObject({ status: 'stale' });
	});

	it('stales singleton documents without touching collection indexes for singleton config changes', async () => {
		const bootstrap = {
			...createBootstrap(),
			configs: [
				createSingletonConfig('about', 'About', 'src/content/about.md'),
				createCollectionConfig('posts', 'Posts', 'src/content/posts')
			],
			singletonContentIdentities: {
				about: {
					path: 'src/content/about.md',
					blobSha: 'blob-about'
				}
			}
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		await githubRepositoryCache.warmSingletonDocumentRoute({
			slug: 'about',
			fetcher,
			priority: 'foreground'
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });

		await githubRepositoryCache.invalidatePaths(['tentman/configs/about.tentman.json']);

		await expect(githubRepositoryCache.getSingletonDocumentForRoute({ slug: 'about' })).resolves
			.toBeNull();
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'singletonDocument:about'
			)
		).toMatchObject({ status: 'stale' });
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'fresh' });
	});

	it('stales block support when a block config path changes', async () => {
		const bootstrap = {
			...createBootstrap(),
			blockConfigs: [{ id: 'hero', path: 'tentman/blocks/hero.tentman.json', config: {} }]
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async () =>
			Response.json({
				blockConfigs: bootstrap.blockConfigs,
				packageBlocks: [],
				blockRegistryError: null
			})
		);

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		await githubRepositoryCache.warmBlockSupport({ fetcher });

		await expect(githubRepositoryCache.getBlockSupport()).resolves.toMatchObject({
			blockConfigs: [{ id: 'hero' }]
		});

		await githubRepositoryCache.invalidatePaths(['tentman/blocks/hero.tentman.json']);

		await expect(githubRepositoryCache.getBlockSupport()).resolves.toBeNull();
		expect(
			get(githubCacheInventoryStatus).records.find((record) => record.targetId === 'blockSupport')
		).toMatchObject({ status: 'stale' });
	});

	it('refreshes stale inventory targets and persists their updated status', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				if (url.includes('slug=notes')) {
					return Response.json(createNotesIndexPayload());
				}
				return Response.json(createIndexPayload());
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		await githubRepositoryCache.invalidatePaths(['tentman/configs/posts.tentman.json']);
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'stale' });

		fetcher.mockClear();
		await githubRepositoryCache.refreshInventory({
			fetcher,
			scope: 'stale'
		});

		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(fetcher).toHaveBeenNthCalledWith(1, '/api/repo/form-config?slug=posts');
		expect(fetcher.mock.calls.slice(1).map(([input]) => input)).toEqual(
			expect.arrayContaining([
				'/api/repo/collection-index?slug=posts',
				'/api/repo/collection-index?slug=notes'
			])
		);
		expect(
			get(githubCacheInventoryStatus).records.find((record) => record.targetId === 'blockSupport')
		).toMatchObject({ status: 'fresh' });
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'fresh' });
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:notes'
			)
		).toMatchObject({ status: 'fresh' });

		githubRepositoryCacheTestApi.resetMemoryForReloadTests();
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'fresh' });
	});

	it('refreshes an individual item-document inventory row', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(1)));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				return Response.json({
					item: {
						title: `Fresh ${parsedUrl.searchParams.get('itemId')}`
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'itemDocument:posts:post-1'
			)
		).toMatchObject({ status: 'missing' });

		fetcher.mockClear();
		await githubRepositoryCache.refreshInventoryTarget({
			targetId: 'itemDocument:posts:post-1',
			fetcher
		});

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith('/api/repo/item-view?slug=posts&itemId=post-1');
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'itemDocument:posts:post-1'
			)
		).toMatchObject({ status: 'fresh' });
		await expect(githubRepositoryCache.getItemDocumentForRoute({ slug: 'posts', itemId: 'post-1' }))
			.resolves.toMatchObject({
				content: {
					title: 'Fresh post-1'
				}
			});
	});

	it('keeps durable inventory totals visible when a warm run restarts', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: {
				...createBootstrap(),
				configs: [createCollectionConfig('posts', 'Posts', 'src/content/posts')]
			} as RepoConfigsBootstrap
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });
		const inventoryTotal = get(githubCacheInventoryStatus).totalTargets;
		expect(inventoryTotal).toBeGreaterThan(0);

		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		expect(get(githubCacheWarmStatus)).toMatchObject({
			phase: 'checking',
			totalTasks: inventoryTotal,
			completedTasks: get(githubCacheInventoryStatus).cachedTargets
		});
	});

	it('clears a draft ref snapshot and index without clearing another ref', async () => {
		const mainFetcher = vi.fn(async () => Response.json(createIndexPayload()));
		const draftFetcher = vi.fn(async () =>
			Response.json(createIndexPayloadForRef(createFallbackItems(1), 'tentman-preview', 'tree-draft'))
		);

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-main', 'main')
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher: mainFetcher });

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-draft', 'tentman-preview')
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher: draftFetcher });
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'post-1' }]
		});

		await githubRepositoryCache.clearRepoRef({
			repoFullName: 'acme/docs',
			ref: 'tentman-preview'
		});

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-main', 'main')
		});
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});
	});

	it('caches singleton documents with block support for warm route reuse', async () => {
		const bootstrap = {
			...createBootstrap(),
			configs: [createSingletonConfig('about', 'About', 'src/content/about.md')],
			singletonContentIdentities: {
				about: {
					path: 'src/content/about.md',
					blobSha: 'blob-about'
				}
			}
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About Tentman'
					},
					blockConfigs: [{ id: 'hero', path: 'tentman/blocks/hero.tentman.json', config: {} }],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});

		await githubRepositoryCache.warmSingletonDocumentRoute({
			slug: 'about',
			fetcher,
			priority: 'foreground'
		});

		await expect(githubRepositoryCache.getSingletonDocumentForRoute({ slug: 'about' })).resolves
			.toMatchObject({
				content: {
					title: 'About Tentman'
				},
				blockSupport: {
					blockConfigs: [{ id: 'hero' }],
					blockRegistryError: null
				}
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('reuses singleton documents across refs when the content blob matches', async () => {
		const mainBootstrap = {
			...createBootstrap('tree-main', 'main'),
			configs: [createSingletonConfig('about', 'About', 'src/content/about.md')],
			singletonContentIdentities: {
				about: {
					path: 'src/content/about.md',
					blobSha: 'blob-about'
				}
			}
		} as RepoConfigsBootstrap;
		const draftBootstrap = {
			...createBootstrap('tree-draft', 'tentman-preview'),
			activeDraftBranch: 'tentman-preview',
			configs: mainBootstrap.configs,
			singletonContentIdentities: mainBootstrap.singletonContentIdentities
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About Tentman'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: mainBootstrap
		});
		await githubRepositoryCache.warmSingletonDocumentRoute({
			slug: 'about',
			fetcher,
			priority: 'foreground'
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: draftBootstrap
		});
		await expect(
			githubRepositoryCache.warmSingletonDocumentRoute({
				slug: 'about',
				fetcher,
				priority: 'foreground'
			})
		).resolves.toMatchObject({
			content: {
				title: 'About Tentman'
			},
			blockSupport: {
				blockRegistryError: null
			}
		});

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher).toHaveBeenNthCalledWith(1, '/api/repo/page-view?slug=about');
		expect(fetcher).toHaveBeenNthCalledWith(2, '/api/repo/form-config?slug=about');
	});

	it('reuses collection projections and item documents across draft refs when blobs match', async () => {
		const mainItems = createFallbackItems(1);
		const mainBootstrap = {
			...createBootstrap('tree-main', 'main'),
			mainRepositoryIdentity: createBootstrap('tree-main', 'main').repositoryIdentity,
			draftRepositoryIdentity: null
		} as RepoConfigsBootstrap;
		const draftIdentity = {
			...createBootstrap('tree-draft', 'tentman-preview').repositoryIdentity,
			headSha: 'head-draft'
		};
		const draftBootstrap = {
			...createBootstrap('tree-draft', 'tentman-preview'),
			activeDraftBranch: 'tentman-preview',
			mainRepositoryIdentity: mainBootstrap.repositoryIdentity,
			repositoryIdentity: draftIdentity,
			draftRepositoryIdentity: draftIdentity
		} as RepoConfigsBootstrap;
		const mainFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(mainItems, 'tree-main'));
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					item: {
						title: 'Cached main document'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayloadWithItems(mainItems, 'tree-main').identity,
				items: createProjectionItems(body.blobShas)
			});
		});
		const draftFetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(
					createIndexPayloadForRef(mainItems, 'tentman-preview', 'tree-draft')
				);
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				throw new Error('matching draft blobs should reuse cached projections');
			}
			if (url.startsWith('/api/repo/item-view')) {
				throw new Error('matching draft blobs should reuse cached item documents');
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: mainBootstrap
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher: mainFetcher,
			visibleLimit: 1,
			waitForBackground: true
		});
		await githubRepositoryCache.setItemDocumentForRoute({
			slug: 'posts',
			itemId: 'post-1',
			content: {
				title: 'Cached main document'
			}
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: draftBootstrap
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher: draftFetcher,
			visibleLimit: 1,
			waitForBackground: true
		});

		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({
			activeRef: 'tentman-preview',
			mainHeadSha: 'head-main',
			mainTreeSha: 'tree-main',
			draftHeadSha: 'head-draft',
			draftTreeSha: 'tree-draft'
		});
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [
				{
					itemId: 'stable-1',
					title: 'Post 1',
					hydration: 'hydrated'
				}
			]
		});
		await expect(githubRepositoryCache.getItemDocumentForRoute({ slug: 'posts', itemId: 'post-1' }))
			.resolves.toMatchObject({
				content: {
					title: 'Cached main document'
				}
			});
		expect(draftFetcher).toHaveBeenCalledTimes(1);
		expect(draftFetcher).toHaveBeenCalledWith('/api/repo/collection-index?slug=posts');
	});

	it('clears singleton documents, item documents, projections, and block support for a repo ref', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
				return Response.json({
					indexIdentity: createIndexPayload().identity,
					items: createProjectionItems(body.blobShas)
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		const bootstrap = {
			...createBootstrap(),
			configs: [
				...createBootstrap().configs,
				createSingletonConfig('about', 'About', 'src/content/about.md')
			]
		} as RepoConfigsBootstrap;

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		await githubRepositoryCache.warmBlockSupport({ fetcher });
		await githubRepositoryCache.warmSingletonDocumentRoute({
			slug: 'about',
			fetcher,
			priority: 'foreground'
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 1,
			waitForBackground: true
		});
		await githubRepositoryCache.setItemDocumentForRoute({
			slug: 'posts',
			itemId: 'stable-hello',
			content: {
				title: 'Hello'
			}
		});

		await expect(githubRepositoryCache.getSingletonDocumentForRoute({ slug: 'about' })).resolves
			.toMatchObject({
				content: { title: 'About' }
			});
		await expect(
			githubRepositoryCache.getItemDocumentForRoute({ slug: 'posts', itemId: 'stable-hello' })
		).resolves.toMatchObject({
			content: { title: 'Hello' }
		});
		await expect(githubRepositoryCache.getBlockSupport()).resolves.toMatchObject({
			blockRegistryError: null
		});

		await githubRepositoryCache.clearRepoRef({
			repoFullName: 'acme/docs',
			ref: 'main'
		});
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});

		await expect(githubRepositoryCache.getSingletonDocumentForRoute({ slug: 'about' })).resolves
			.toBeNull();
		await expect(
			githubRepositoryCache.getItemDocumentForRoute({ slug: 'posts', itemId: 'stable-hello' })
		).resolves.toBeNull();
		await expect(githubRepositoryCache.getBlockSupport()).resolves.toBeNull();
	});

	it('warms all collection indexes before hydrating site projections', async () => {
		const events: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				events.push('block-support');
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				events.push(`document:${parsedUrl.searchParams.get('slug')}:${parsedUrl.searchParams.get('itemId')}`);
				return Response.json({
					item: {
						title: parsedUrl.searchParams.get('itemId')
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.includes('slug=posts')) {
				events.push('index:posts');
				return Response.json(createIndexPayloadWithItems(createFallbackItems(2)));
			}
			if (url.includes('slug=notes')) {
				events.push('index:notes');
				return Response.json(createNotesIndexPayload());
			}

			const body = JSON.parse(String(init?.body)) as { slug: string; blobShas: string[] };
			events.push(`projection:${body.slug}:${body.blobShas.join(',')}`);
			return Response.json({
				indexIdentity:
					body.slug === 'notes' ? createNotesIndexPayload().identity : createIndexPayload().identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).phase).toBe('ready');

		expect(events.slice(0, 5)).toEqual([
			'block-support',
			'index:posts',
			'index:notes',
			'projection:posts:blob-1,blob-2',
			'projection:notes:blob-note'
		]);
		expect(events.slice(5).sort()).toEqual([
			'document:notes:field-note',
			'document:posts:post-1',
			'document:posts:post-2'
		]);
		expect(get(githubCacheWarmStatus)).toMatchObject({
			phase: 'ready',
			totalCollections: 2,
			warmedCollections: 2,
			totalItems: 3,
			hydratedItems: 3,
			totalTasks: 8,
			completedTasks: 8
		});
	});

	it('keeps required targets cached while skipping passive item documents beyond budget', async () => {
		githubRepositoryCacheTestApi.setFullDocumentBudgetForTests({ recordLimit: 1 });
		const itemViewCalls: string[] = [];
		const items = createFallbackItems(3);
		const bootstrap = {
			...createBootstrap(),
			configs: [
				createSingletonConfig('about', 'About', 'src/content/about.md'),
				createCollectionConfig('posts', 'Posts', 'src/content/posts')
			],
			singletonContentIdentities: {
				about: {
					path: 'src/content/about.md',
					blobSha: 'blob-about'
				}
			}
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(items));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				const itemId = parsedUrl.searchParams.get('itemId') ?? '';
				itemViewCalls.push(itemId);
				return Response.json({
					item: {
						title: itemId
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayloadWithItems(items).identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).phase).toBe('ready');

		const inventory = get(githubCacheInventoryStatus);
		expect(inventory).toMatchObject({
			budgetLimited: true,
			documentRecords: 1,
			skippedBudgetTargets: 2,
			missingTargets: 0,
			staleTargets: 0
		});
		expect(
			inventory.records
				.filter((record) => record.targetType === 'collectionProjection')
				.sort((a, b) => a.targetId.localeCompare(b.targetId))
				.map((record) => record.status)
		).toEqual(['fresh', 'fresh', 'fresh']);
		expect(
			inventory.records
				.filter((record) => record.targetType === 'itemDocument')
				.sort((a, b) => a.targetId.localeCompare(b.targetId))
				.map((record) => record.status)
		).toEqual(['fresh', 'skipped-budget', 'skipped-budget']);
		expect(
			inventory.records.find((record) => record.targetId === 'singletonDocument:about')
		).toMatchObject({ status: 'fresh' });
		expect(itemViewCalls).toEqual(['post-1']);
	});

	it('caps idle full-document warming without limiting projection hydration', async () => {
		githubRepositoryCacheTestApi.setIdleFullDocumentWarmBudgetForTests({ recordLimit: 2 });
		const itemViewCalls: string[] = [];
		const items = createFallbackItems(4);
		const bootstrap = {
			...createBootstrap(),
			configs: [createCollectionConfig('posts', 'Posts', 'src/content/posts')]
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(items));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				const itemId = parsedUrl.searchParams.get('itemId') ?? '';
				itemViewCalls.push(itemId);
				return Response.json({
					item: {
						title: itemId
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayloadWithItems(items).identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).phase).toBe('ready');

		expect(itemViewCalls).toEqual(['post-1', 'post-2']);
		const inventory = get(githubCacheInventoryStatus);
		expect(
			inventory.records
				.filter((record) => record.targetType === 'collectionProjection')
				.sort((a, b) => a.targetId.localeCompare(b.targetId))
				.map((record) => record.status)
		).toEqual(['fresh', 'fresh', 'fresh', 'fresh']);
		expect(
			inventory.records
				.filter((record) => record.targetType === 'itemDocument')
				.sort((a, b) => a.targetId.localeCompare(b.targetId))
				.map((record) => record.status)
		).toEqual(['fresh', 'fresh', 'skipped-budget', 'skipped-budget']);
	});

	it('stops later idle full-document fetches after the byte budget is exhausted', async () => {
		githubRepositoryCacheTestApi.setIdleFullDocumentWarmBudgetForTests({
			bytes: 1,
			recordLimit: 10
		});
		const itemViewCalls: string[] = [];
		const items = createFallbackItems(3);
		const bootstrap = {
			...createBootstrap(),
			configs: [createCollectionConfig('posts', 'Posts', 'src/content/posts')]
		} as RepoConfigsBootstrap;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(items));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				const itemId = parsedUrl.searchParams.get('itemId') ?? '';
				itemViewCalls.push(itemId);
				return Response.json({
					item: {
						title: itemId
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayloadWithItems(items).identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});
		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).phase).toBe('ready');

		expect(itemViewCalls).toEqual(['post-1']);
		expect(
			get(githubCacheInventoryStatus).records
				.filter((record) => record.targetType === 'itemDocument')
				.sort((a, b) => a.targetId.localeCompare(b.targetId))
				.map((record) => record.status)
		).toEqual(['fresh', 'skipped-budget', 'skipped-budget']);
	});

	it('schedules only the requested collection item document when a single item route is warmed', async () => {
		const documentCalls: string[] = [];
		const itemDocuments = new Map(
			createFallbackItems(4).map((item) => [item.itemId, createDeferred<Response>()])
		);
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(4)));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				const itemId = parsedUrl.searchParams.get('itemId') ?? '';
				documentCalls.push(itemId);
				return await itemDocuments.get(itemId)!.promise;
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			const body = JSON.parse(String(init?.body)) as { slug: string; blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		const warmPromise = githubRepositoryCache.warmItemDocumentForRoute({
			slug: 'posts',
			itemId: 'post-2',
			fetcher,
			priority: 'foreground'
		});

		await expect
			.poll(() => get(githubCacheWarmDebugStatus).taskKinds.itemDocument.total)
			.toBe(1);
		expect(documentCalls[0]).toBe('post-2');
		expect(documentCalls).toEqual(['post-2']);

		itemDocuments.get('post-2')!.resolve(
			Response.json({
				item: { title: 'post-2' },
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null
			})
		);
		await warmPromise;
	});

	it('promotes queued collection item documents repeatedly without duplicating queue totals', async () => {
		const itemDocuments = new Map(
			createFallbackItems(3).map((item) => [item.itemId, createDeferred<Response>()])
		);
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(3)));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				const itemId = parsedUrl.searchParams.get('itemId') ?? '';
				return await itemDocuments.get(itemId)!.promise;
			}
			return Response.json({
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		void githubRepositoryCache.warmCollectionDocuments('posts', {
			fetcher,
			priority: 'passive'
		});
		await expect
			.poll(() => get(githubCacheWarmDebugStatus).taskKinds.itemDocument.total)
			.toBe(3);

		const totalBeforePromotion = get(githubCacheWarmDebugStatus).totalTasks;
		for (let index = 0; index < 3; index += 1) {
			githubRepositoryCache.promoteRoute({
				slug: 'posts',
				itemId: 'post-3',
				fetcher
			});
		}
		await expect
			.poll(() => get(githubCacheWarmDebugStatus).taskKinds.itemDocument.total)
			.toBe(3);
		expect(get(githubCacheWarmDebugStatus).totalTasks).toBe(totalBeforePromotion);

		for (const [itemId, deferred] of itemDocuments) {
			deferred.resolve(
				Response.json({
					item: { title: itemId },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				})
			);
		}
		await expect
			.poll(() => get(githubCacheWarmDebugStatus).taskKinds.itemDocument.completed)
			.toBe(3);
	});

	it('keeps foreground item route work ahead of passive queued documents', async () => {
		const idleCallbacks: IdleRequestCallback[] = [];
		const idleWindow = window as unknown as MutableIdleWindow;
		idleWindow.requestIdleCallback = ((callback: IdleRequestCallback) => {
			idleCallbacks.push(callback);
			return idleCallbacks.length;
		}) as typeof window.requestIdleCallback;

		const documentCalls: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(3)));
			}
			if (url.startsWith('/api/repo/item-view')) {
				const parsedUrl = new URL(url, 'http://localhost');
				const itemId = parsedUrl.searchParams.get('itemId') ?? '';
				documentCalls.push(itemId);
				return Response.json({
					item: { title: itemId },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			return Response.json({
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });

		void githubRepositoryCache.warmCollectionDocuments('posts', {
			fetcher,
			priority: 'passive'
		});
		await expect
			.poll(() => get(githubCacheWarmDebugStatus).taskKinds.itemDocument.total)
			.toBe(3);

		const promoted = githubRepositoryCache.warmItemDocumentForRoute({
			slug: 'posts',
			itemId: 'post-3',
			fetcher,
			priority: 'foreground'
		});

		await expect.poll(() => documentCalls).toEqual(['post-3']);
		expect(idleCallbacks.length).toBeGreaterThan(0);
		for (const callback of idleCallbacks) {
			callback({ didTimeout: false, timeRemaining: () => 50 });
		}
		await promoted;
	});

	it('does not write stale block support after the repository identity changes mid-flight', async () => {
		const itemResponse = createDeferred<Response>();
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(1)));
			}
			if (url.startsWith('/api/repo/item-view')) {
				return itemResponse.promise;
			}
			return Response.json({
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		const warmPromise = githubRepositoryCache.warmItemDocumentForRoute({
			slug: 'posts',
			itemId: 'post-1',
			fetcher,
			priority: 'foreground'
		});
		await expect.poll(() => fetcher).toHaveBeenCalledWith(
			'/api/repo/item-view?slug=posts&itemId=post-1'
		);

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-next')
		});
		itemResponse.resolve(
			Response.json({
				item: { title: 'stale post' },
				blockConfigs: [{ slug: 'stale-block' }],
				packageBlocks: [],
				blockRegistryError: null
			})
		);

		await expect(warmPromise).resolves.toBeNull();
		await expect(githubRepositoryCache.getBlockSupport()).resolves.toBeNull();
	});

	it('retries rate-limited foreground cache work and surfaces the backoff status', async () => {
		githubRepositoryCacheTestApi.setEndpointRetryPolicyForTests({
			attempts: 2,
			baseDelayMs: 200,
			maxDelayMs: 200
		});
		let calls = 0;
		const fetcher = vi.fn(async () => {
			calls += 1;
			if (calls === 1) {
				return new Response(null, {
					status: 429,
					headers: {
						'retry-after': '1'
					}
				});
			}
			return Response.json(createIndexPayload());
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		const promise = githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).message).toBe(
			'GitHub rate limit reached; retrying cache work'
		);
		expect(get(githubCacheWorkObservabilityStatus).current).toMatchObject({
			state: 'backing-off',
			operation: 'retry-backoff',
			label: 'Posts'
		});
		await expect(promise).resolves.toBeUndefined();
		expect(fetcher).toHaveBeenCalledTimes(2);
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});
	});

	it('retries rate-limited projection batches and surfaces the backoff status', async () => {
		githubRepositoryCacheTestApi.setEndpointRetryPolicyForTests({
			attempts: 2,
			baseDelayMs: 50,
			maxDelayMs: 50
		});
		let projectionCalls = 0;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(1)));
			}
			projectionCalls += 1;
			if (projectionCalls === 1) {
				return new Response(null, {
					status: 429,
					headers: {
						'retry-after': '1'
					}
				});
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		const promise = githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 1,
			hydrateRemaining: false,
			warmDocuments: false
		});

		await expect.poll(() => get(githubCacheWarmStatus).message).toBe(
			'GitHub rate limit reached; retrying cache work'
		);
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'cache-work',
					phase: 'backoff',
					operation: 'retry-backoff',
					workflow: 'desktop-collection-landing',
					route: '/pages/posts',
					repoFullName: 'acme/docs',
					ref: 'main',
					taskKind: 'collectionProjectionBatch',
					priority: 'foreground',
					reason: 'GitHub rate limit reached; retrying cache work'
				})
			])
		);
		await expect(promise).resolves.toBeUndefined();
		expect(projectionCalls).toBe(2);
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ title: 'Post 1', hydration: 'hydrated' }]
		});
	});

	it('retries secondary-limited projection batches with retry-after guidance', async () => {
		githubRepositoryCacheTestApi.setEndpointRetryPolicyForTests({
			attempts: 2,
			baseDelayMs: 50,
			maxDelayMs: 50
		});
		let projectionCalls = 0;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayloadWithItems(createFallbackItems(1)));
			}
			projectionCalls += 1;
			if (projectionCalls === 1) {
				return Response.json(
					{ message: 'You have exceeded a secondary rate limit.' },
					{
						status: 403,
						headers: {
							'retry-after': '1'
						}
					}
				);
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			return Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await expect(
			githubRepositoryCache.warmCollection('posts', {
				fetcher,
				visibleLimit: 1,
				hydrateRemaining: false,
				warmDocuments: false
			})
		).resolves.toBeUndefined();

		expect(projectionCalls).toBe(2);
		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ title: 'Post 1', hydration: 'hydrated' }]
		});
	});

	it('pauses passive warming before document fetches when projection responses report exhausted quota', async () => {
		const itemViewCalls: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/collection-index')) {
				if (url.includes('slug=notes')) {
					return Response.json(createNotesIndexPayload());
				}
				return Response.json(createIndexPayloadWithItems(createFallbackItems(1)));
			}
			if (url.startsWith('/api/repo/item-view')) {
				itemViewCalls.push(url);
				return Response.json({
					item: { title: 'Should not warm' },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[]; slug: string };
			return Response.json(
				{
					indexIdentity:
						body.slug === 'notes' ? createNotesIndexPayload().identity : createIndexPayload().identity,
					items: createProjectionItems(body.blobShas)
				},
				{
					headers: {
						'x-ratelimit-remaining': '0',
						'x-ratelimit-reset': '123'
					}
				}
			);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).phase).toBe('error');
		expect(get(githubCacheWarmStatus)).toMatchObject({
			message: 'Cache warm paused',
			error: 'GitHub rate limit exhausted; background cache warm paused'
		});
		expect(get(githubCacheWorkObservabilityStatus).current).toMatchObject({
			state: 'rate-limited',
			operation: 'rate-limit-pause',
			reason: 'GitHub rate limit exhausted; background cache warm paused'
		});
		expect(itemViewCalls).toEqual([]);
	});

	it('does not refetch projections already cached by blob SHA and schema identity', async () => {
		const projectionCalls: string[][] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					item: {
						title: 'Cached document'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.includes('slug=posts')) {
				return Response.json(createIndexPayload());
			}
			if (url.includes('slug=notes')) {
				return Response.json(createNotesIndexPayload());
			}

			const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
			projectionCalls.push(body.blobShas);
			return Response.json({
				indexIdentity: createIndexPayload().identity,
				items: createProjectionItems(body.blobShas)
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.warmCollection('posts', {
			fetcher,
			visibleLimit: 1,
			waitForBackground: true
		});

		projectionCalls.length = 0;
		githubRepositoryCache.startIdleSiteWarm({ fetcher });

		await expect.poll(() => get(githubCacheWarmStatus).phase).toBe('ready');
		expect(projectionCalls).toEqual([['blob-note']]);
	});

	it('checks freshness with the active repository identity', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), 'http://localhost');
			expect(url.pathname).toBe('/api/repo/freshness');
			expect(url.searchParams.get('previousRef')).toBe('main');
			expect(url.searchParams.get('previousHeadSha')).toBe('head-main');
			expect(url.searchParams.get('previousTreeSha')).toBe('tree-main');
			return Response.json({
				repositoryIdentity: createBootstrap().repositoryIdentity,
				mainRepositoryIdentity: createBootstrap().repositoryIdentity,
				draftRepositoryIdentity: null
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		await githubRepositoryCache.checkFreshness({
			fetcher,
			warmChanged: false
		});

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'browser-request',
					workflow: 'freshness',
					endpoint: expect.stringContaining('/api/repo/freshness'),
					priority: 'passive'
				})
			])
		);
		assertWorkflowRequestBudgetForTests({
			workflow: 'freshness',
			route: '/pages',
			maxBrowserRequests: 1,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 1
		});
		expect(get(githubCacheInventoryStatus).lastCheckedAt).toEqual(expect.any(Number));
	});

	it('dedupes concurrent unchanged freshness checks for the same active identity', async () => {
		const deferred = createDeferred<Response>();
		const fetcher = vi.fn(async () => deferred.promise);

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		const firstCheck = githubRepositoryCache.checkFreshness({
			fetcher,
			warmChanged: false
		});
		const secondCheck = githubRepositoryCache.checkFreshness({
			fetcher,
			warmChanged: false
		});

		await expect.poll(() => fetcher).toHaveBeenCalledTimes(1);
		deferred.resolve(
			Response.json({
				repositoryIdentity: createBootstrap().repositoryIdentity,
				mainRepositoryIdentity: createBootstrap().repositoryIdentity,
				draftRepositoryIdentity: null
			})
		);

		await expect(Promise.all([firstCheck, secondCheck])).resolves.toEqual([undefined, undefined]);
		expect(fetcher).toHaveBeenCalledTimes(1);
		assertWorkflowRequestBudgetForTests({
			workflow: 'freshness',
			route: '/pages',
			maxBrowserRequests: 1,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 1
		});
	});

	it('surfaces failed freshness checks through inventory while keeping cached navigation usable', async () => {
		const indexFetcher = vi.fn(async () => Response.json(createIndexPayload()));
		const failingFetcher = vi.fn(async () => new Response(null, { status: 503 }));

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher: indexFetcher });

		await expect(
			githubRepositoryCache.checkFreshness({
				fetcher: failingFetcher,
				warmChanged: false
			})
		).rejects.toThrow('Failed to check repository freshness (503)');

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});
		expect(get(githubCacheInventoryStatus).records).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					targetId: 'collectionIndex:posts',
					status: 'fresh',
					error: 'Failed to check repository freshness (503)'
				}),
				expect.objectContaining({
					targetId: 'snapshot',
					status: 'fresh',
					error: 'Failed to check repository freshness (503)'
				})
			])
		);
	});

	it('backs off unchanged freshness checks and resets after changed paths', async () => {
		const fetcher = vi.fn(async () => Response.json(createBootstrap()));
		const indexFetcher = vi.fn(async () => Response.json(createIndexPayload()));
		const changedCalls: string[] = [];
		const changedFetcher = vi.fn(async (input: RequestInfo | URL) => {
			changedCalls.push(String(input));
			return Response.json({
				repositoryIdentity: createBootstrap('tree-next').repositoryIdentity,
				mainRepositoryIdentity: createBootstrap('tree-next').repositoryIdentity,
				draftRepositoryIdentity: null,
				unchanged: false,
				freshnessStatus: 'changed',
				changedPaths: ['src/content/posts/hello-world.md']
			});
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher: indexFetcher });

		await githubRepositoryCache.checkFreshness({
			fetcher,
			warmChanged: false
		});
		expect(githubRepositoryCacheTestApi.getFreshnessBackoffIndexForTests()).toBe(1);

		await githubRepositoryCache.checkFreshness({
			fetcher,
			warmChanged: false
		});
		expect(githubRepositoryCacheTestApi.getFreshnessBackoffIndexForTests()).toBe(2);

		await githubRepositoryCache.checkFreshness({
			fetcher: changedFetcher,
			warmChanged: false
		});
		expect(githubRepositoryCacheTestApi.getFreshnessBackoffIndexForTests()).toBe(0);
		expect(
			get(githubCacheInventoryStatus).records.find(
				(record) => record.targetId === 'collectionIndex:posts'
			)
		).toMatchObject({ status: 'stale' });
		expect(changedFetcher).toHaveBeenCalledTimes(1);
		expect(changedCalls[0]).toContain('/api/repo/freshness');
		expect(changedCalls[0]).not.toContain('/api/repo/configs');
	});

	it('marks active records stale with recovery guidance when freshness cannot derive paths', async () => {
		const indexFetcher = vi.fn(async () => Response.json(createIndexPayload()));
		const staleFetcher = vi.fn(async () =>
			Response.json({
				repositoryIdentity: createBootstrap('tree-next').repositoryIdentity,
				mainRepositoryIdentity: createBootstrap('tree-next').repositoryIdentity,
				draftRepositoryIdentity: null,
				unchanged: false,
				freshnessStatus: 'stale',
				changedPaths: null,
				error: 'The previous GitHub tree is no longer available.',
				recovery: 'Refresh stale GitHub cache records to reload route data.'
			})
		);

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher: indexFetcher });

		await githubRepositoryCache.checkFreshness({
			fetcher: staleFetcher,
			warmChanged: false
		});

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toMatchObject({
			items: [{ itemId: 'hello-world' }]
		});
		expect(get(githubCacheInventoryStatus).records).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					targetId: 'collectionIndex:posts',
					status: 'stale',
					error: expect.stringContaining('Refresh stale GitHub cache records')
				}),
				expect.objectContaining({
					targetId: 'blockSupport',
					status: 'stale',
					error: expect.stringContaining('previous GitHub tree')
				})
			])
		);
		expect(staleFetcher).toHaveBeenCalledTimes(1);
	});
});
