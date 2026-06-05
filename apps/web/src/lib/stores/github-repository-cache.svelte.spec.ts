import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	githubCacheWarmDebugStatus,
	githubCacheWarmStatus,
	githubRepositoryCache,
	githubRepositoryCacheTestApi
} from '$lib/stores/github-repository-cache';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';

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
		await githubRepositoryCache.ensureCollectionIndex('posts', { fetcher });

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

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap('tree-next')
		});

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
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

	it('clears snapshots and collection indexes for repository structure changes', async () => {
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

		await expect(githubRepositoryCache.getCollectionNavigation('posts')).resolves.toBeNull();
		await expect(githubRepositoryCacheTestApi.getCollectionIndex('posts')).resolves.toBeNull();
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
			configs: [createSingletonConfig('about', 'About', 'src/content/about.md')]
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

	it('schedules every current collection item document when a single item route is warmed', async () => {
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
			.toBe(4);
		expect(get(githubCacheWarmDebugStatus).totalTasks).toBe(5);
		expect(documentCalls[0]).toBe('post-2');

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
		await warmPromise;
	});

	it('promotes queued collection item documents without duplicating queue totals', async () => {
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
		githubRepositoryCache.promoteRoute({
			slug: 'posts',
			itemId: 'post-3',
			fetcher
		});
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
});
