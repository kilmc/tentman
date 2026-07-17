import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import {
	githubRepositoryCache,
	githubRepositoryCacheTestApi
} from '$lib/stores/github-repository-cache';
import {
	assertWorkflowRequestBudgetForTests,
	clearWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';
import { load as loadCollectionLanding } from '../../../routes/pages/[page]/+page';
import { load as loadItemView } from '../../../routes/pages/[page]/[itemId]/+page';
import { load as loadItemEditView } from '../../../routes/pages/[page]/[itemId]/edit/+page';

function createBootstrap(): RepoConfigsBootstrap {
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
			repoKey: 'github:acme/docs?ref=main',
			mode: 'github',
			label: 'acme/docs',
			ref: 'main',
			headSha: 'head-main',
			treeSha: 'tree-main',
			resolvedAt: 1
		},
		configs: [
			{
				slug: 'projects',
				path: 'tentman/configs/projects.tentman.json',
				config: {
					type: 'content',
					label: 'Projects',
					collection: true,
					idField: 'slug',
					content: {
						mode: 'directory',
						path: '../../src/content/projects',
						template: '../../src/content/projects/_template.md'
					},
					blocks: [{ id: 'title', type: 'text', label: 'Title' }]
				}
			}
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

function createIndexPayload() {
	return {
		identity: {
			repoKey: 'github:acme/docs?ref=main',
			ref: 'main',
			headSha: 'head-main',
			treeSha: 'tree-main',
			configSlug: 'projects',
			configPath: 'tentman/configs/projects.tentman.json',
			contentIdentity: 'src/content/projects:src/content/projects/_template.md',
			schemaIdentity: 'title'
		},
		configSlug: 'projects',
		mode: 'directory' as const,
		items: [
			{
				itemId: 'panorama-4',
				route: 'panorama-4',
				path: 'src/content/projects/panorama-4.md',
				filename: 'panorama-4.md',
				blobSha: 'blob-panorama',
				title: 'panorama 4',
				sortDate: null,
				hydration: 'fallback' as const,
				hrefItemId: 'panorama-4'
			}
		]
	};
}

function createSingletonBootstrap(): RepoConfigsBootstrap {
	return {
		...createBootstrap(),
		configs: [
			{
				slug: 'about',
				path: 'tentman/configs/about.tentman.json',
				config: {
					type: 'content',
					label: 'About',
					collection: false,
					content: {
						mode: 'file',
						path: '../../src/content/about.md'
					},
					blocks: [{ id: 'title', type: 'text', label: 'Title' }]
				}
			}
		]
	} as RepoConfigsBootstrap;
}

function createTagBootstrap(): RepoConfigsBootstrap {
	const bootstrap = createBootstrap();
	return {
		...bootstrap,
		configs: [
			{
				...bootstrap.configs[0],
				config: {
					...bootstrap.configs[0].config,
					blocks: [
						{ id: 'title', type: 'text', label: 'Title' },
						{ id: 'topics', type: 'tags', label: 'Topics' }
					]
				}
			}
		]
	} as RepoConfigsBootstrap;
}

function createMixedConfigBootstrap(): RepoConfigsBootstrap {
	const singleton = createSingletonBootstrap().configs[0];
	const collection = createBootstrap().configs[0];
	return {
		...createBootstrap(),
		configs: [singleton, collection]
	} as RepoConfigsBootstrap;
}

function createLoadEvent(fetch: typeof globalThis.fetch, bootstrap = createBootstrap()) {
	return {
		parent: async () => bootstrap,
		fetch,
		params: {
			page: bootstrap.configs[0]?.slug ?? 'projects'
		},
		url: new URL(`http://localhost/pages/${bootstrap.configs[0]?.slug ?? 'projects'}`),
		depends: vi.fn()
	};
}

function createItemLoadEvent(
	fetch: typeof globalThis.fetch,
	pathname: string,
	bootstrap = createBootstrap()
) {
	return {
		parent: async () => bootstrap,
		fetch,
		params: {
			page: 'projects',
			itemId: 'panorama-4'
		},
		url: new URL(`http://localhost${pathname}`),
		depends: vi.fn()
	};
}

describe('GitHub collection route cache in the browser', () => {
	beforeEach(async () => {
		await githubRepositoryCacheTestApi.reset();
		clearWorkflowInstrumentationEventsForTests();
	});

	afterEach(async () => {
		await githubRepositoryCacheTestApi.reset();
		clearWorkflowInstrumentationEventsForTests();
	});

	it('returns warm collection navigation without calling the page-view endpoint', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				throw new Error('collection landing should not call page-view');
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				expect(JSON.parse(String(init?.body))).toEqual({
					slug: 'projects',
					blobShas: ['blob-panorama']
				});
				return Response.json({
					indexIdentity: createIndexPayload().identity,
					items: [
						{
							...createIndexPayload().items[0],
							title: 'Panorama 4',
							hydration: 'hydrated'
						}
					]
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const firstResult = await loadCollectionLanding(createLoadEvent(fetch) as never);
		const secondResult = await loadCollectionLanding(createLoadEvent(fetch) as never);

		expect(firstResult).toMatchObject({
			pageSlug: 'projects',
			collectionNavigation: {
				items: [{ title: 'Panorama 4', hydration: 'hydrated' }]
			}
		});
		expect(secondResult).toMatchObject({
			pageSlug: 'projects',
			collectionNavigation: {
				items: [{ title: 'Panorama 4', hydration: 'hydrated' }]
			}
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenNthCalledWith(1, '/api/repo/collection-index?slug=projects');
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			'/api/repo/collection-projections',
			expect.objectContaining({
				method: 'POST'
			})
		);
		assertWorkflowRequestBudgetForTests({
			workflow: 'desktop-collection-landing',
			route: '/pages/projects',
			maxBrowserRequests: 2,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 2
		});

		await expect(githubRepositoryCache.getCollectionNavigation('projects')).resolves.toMatchObject({
			items: [{ title: 'Panorama 4' }]
		});
	});

	it('seeds and reuses singleton page content without calling page-view again', async () => {
		const bootstrap = createSingletonBootstrap();
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					discoveredConfig: bootstrap.configs[0],
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null,
					content: {
						title: 'About Tentman'
					},
					collectionNavigation: null,
					contentError: null,
					branch: null,
					pageSlug: 'about',
					mode: 'github'
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await expect(loadCollectionLanding(createLoadEvent(fetch, bootstrap) as never)).resolves
			.toMatchObject({
				content: {
					title: 'About Tentman'
				}
			});
		await expect(loadCollectionLanding(createLoadEvent(fetch, bootstrap) as never)).resolves
			.toMatchObject({
				content: {
					title: 'About Tentman'
				},
				blockRegistryError: null
			});

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith('/api/repo/page-view?slug=about');
		assertWorkflowRequestBudgetForTests({
			workflow: 'item-route-shell',
			route: '/pages/about',
			maxBrowserRequests: 1,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 1
		});
	});

	it('opens a cached singleton route by fetching only missing block support', async () => {
		const bootstrap = createSingletonBootstrap();
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				throw new Error('cached singleton routes should not call page-view');
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
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
		await githubRepositoryCache.setSingletonPageView({
			slug: 'about',
			content: {
				title: 'About Tentman'
			}
		});

		await expect(loadCollectionLanding(createLoadEvent(fetch, bootstrap) as never)).resolves
			.toMatchObject({
				content: {
					title: 'About Tentman'
				},
				blockConfigs: [{ id: 'hero' }],
				blockRegistryError: null
			});

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith('/api/repo/form-config?slug=about');
		assertWorkflowRequestBudgetForTests({
			workflow: 'item-route-shell',
			route: '/pages/about',
			maxBrowserRequests: 1,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 1
		});
	});

	it('uses a cached item document without calling the item-view endpoint', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/item-view')) {
				throw new Error('cached item routes should not call item-view');
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [{ id: 'gallery', path: 'tentman/blocks/gallery.tentman.json', config: {} }],
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
		await githubRepositoryCache.ensureCollectionIndex('projects', { fetcher: fetch });
		await githubRepositoryCache.setItemDocumentForRoute({
			slug: 'projects',
			itemId: 'panorama-4',
			content: {
				title: 'Panorama 4',
				slug: 'panorama-4'
			}
		});

		await expect(
			loadItemView(createItemLoadEvent(fetch, '/pages/projects/panorama-4') as never)
		).resolves.toMatchObject({
			item: {
				title: 'Panorama 4'
			},
			blockConfigs: [{ id: 'gallery' }],
			itemId: 'panorama-4',
			pageSlug: 'projects'
		});
		await expect(
			loadItemEditView(createItemLoadEvent(fetch, '/pages/projects/panorama-4/edit') as never)
		).resolves.toMatchObject({
			item: {
				title: 'Panorama 4'
			},
			itemId: 'panorama-4',
			pageSlug: 'projects'
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenNthCalledWith(1, '/api/repo/collection-index?slug=projects');
		expect(fetch).toHaveBeenNthCalledWith(2, '/api/repo/form-config?slug=projects');
		assertWorkflowRequestBudgetForTests({
			workflow: 'item-route-shell',
			route: '/pages/projects/panorama-4',
			maxBrowserRequests: 1,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 1
		});
	});

	it('fetches only the selected item view when an indexed item document is not cached', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				throw new Error('item routes should not call page-view');
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					discoveredConfig: createBootstrap().configs[0],
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null,
					navigationManifest: createBootstrap().navigationManifest,
					item: {
						title: 'Panorama 4',
						slug: 'panorama-4'
					},
					contentError: null,
					itemId: 'panorama-4',
					branch: null,
					pageSlug: 'projects',
					mode: 'github'
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});
		await githubRepositoryCache.ensureCollectionIndex('projects', { fetcher: fetch });

		await expect(
			loadItemView(createItemLoadEvent(fetch, '/pages/projects/panorama-4') as never)
		).resolves.toMatchObject({
			item: {
				title: 'Panorama 4'
			},
			itemId: 'panorama-4',
			pageSlug: 'projects'
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenNthCalledWith(1, '/api/repo/collection-index?slug=projects');
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			'/api/repo/item-view?slug=projects&itemId=panorama-4'
		);
		assertWorkflowRequestBudgetForTests({
			workflow: 'item-route-shell',
			route: '/pages/projects/panorama-4',
			maxBrowserRequests: 1,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 1
		});
		await expect(
			githubRepositoryCache.getItemDocumentForRoute({
				slug: 'projects',
				itemId: 'panorama-4'
			})
		).resolves.toMatchObject({
			content: {
				title: 'Panorama 4'
			}
		});
	});

	it('loads item edit existing items from the index without a foreground projection batch', async () => {
		const bootstrap = createTagBootstrap();
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-projections')) {
				throw new Error('edit shell should not read every collection projection');
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					discoveredConfig: bootstrap.configs[0],
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null,
					navigationManifest: bootstrap.navigationManifest,
					item: {
						title: 'Panorama 4',
						slug: 'panorama-4',
						topics: ['berlin']
					},
					contentError: null,
					itemId: 'panorama-4',
					branch: null,
					pageSlug: 'projects',
					mode: 'github'
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap
		});

		await expect(
			loadItemEditView(
				createItemLoadEvent(fetch, '/pages/projects/panorama-4/edit', bootstrap) as never
			)
		).resolves.toMatchObject({
			item: {
				title: 'Panorama 4'
			},
			existingItems: [
				expect.objectContaining({
					slug: 'panorama-4',
					_tentmanId: 'panorama-4'
				})
			]
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenNthCalledWith(1, '/api/repo/collection-index?slug=projects');
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			'/api/repo/item-view?slug=projects&itemId=panorama-4'
		);
	});

	it('returns a normalized item workflow error when route records fail to load', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return new Response(null, { status: 503 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: 'acme/docs',
			bootstrap: createBootstrap()
		});

		await expect(
			githubRepositoryCache.loadItemViewWorkflowData('projects', 'panorama-4', {
				fetcher: fetch,
				priority: 'foreground',
				route: '/pages/projects/panorama-4'
			})
		).resolves.toMatchObject({
			slug: 'projects',
			itemId: 'panorama-4',
			readiness: 'error',
			cacheMiss: {
				target: 'item-view',
				slug: 'projects',
				itemId: 'panorama-4',
				readiness: 'error',
				status: 503,
				reason: 'Failed to load collection index (503)'
			}
		});
	});

	it('scopes cached item block-support misses to the selected collection slug', async () => {
		const bootstrap = createMixedConfigBootstrap();
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			if (url.startsWith('/api/repo/form-config')) {
				expect(url).toBe('/api/repo/form-config?slug=projects');
				return Response.json({
					blockConfigs: [{ id: 'gallery', path: 'tentman/blocks/gallery.tentman.json', config: {} }],
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
		await githubRepositoryCache.ensureCollectionIndex('projects', { fetcher: fetch });
		await githubRepositoryCache.setItemDocumentForRoute({
			slug: 'projects',
			itemId: 'panorama-4',
			content: {
				title: 'Panorama 4',
				slug: 'panorama-4'
			}
		});
		fetch.mockClear();

		await expect(
			loadItemView(createItemLoadEvent(fetch, '/pages/projects/panorama-4', bootstrap) as never)
		).resolves.toMatchObject({
			item: {
				title: 'Panorama 4'
			},
			blockConfigs: [{ id: 'gallery' }]
		});

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith('/api/repo/form-config?slug=projects');
	});
});
