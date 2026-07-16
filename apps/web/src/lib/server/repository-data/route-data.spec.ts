import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getCollectionNavigation: vi.fn(async () => null),
	resolveCollectionItemDocument: vi.fn(async () => null),
	getSingletonConfigStates: vi.fn(async () => null),
	getSingletonDocument: vi.fn(async () => null)
}));

import {
	resolveCollectionItemForRoute,
	resolveCollectionItemRouteData,
	resolveCollectionNavigationForRoute,
	resolvePageViewContentForRoute,
	resolveSingletonConfigStatesForRoute
} from './route-data';
import {
	getCollectionNavigation,
	resolveCollectionItemDocument,
	getSingletonConfigStates,
	getSingletonDocument
} from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';
import {
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';

const collectionConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		label: 'Posts',
		collection: true,
		content: {
			mode: 'directory'
		},
		blocks: [
			{
				id: 'title',
				type: 'text'
			}
		]
	}
} as const;

const fileCollectionConfig = {
	...collectionConfig,
	config: {
		...collectionConfig.config,
		content: {
			mode: 'file'
		}
	}
} as const;

const singletonConfig = {
	slug: 'about',
	path: 'content/about.tentman.json',
	config: {
		label: 'About',
		collection: false,
		state: {
			blockId: 'published',
			cases: [{ value: false, label: 'Draft', variant: 'warning', icon: 'file-pen' }]
		},
		content: {
			mode: 'file'
		},
		blocks: [
			{
				id: 'title',
				type: 'text'
			},
			{
				id: 'published',
				type: 'toggle'
			}
		]
	}
} as const;

const backend = {
	kind: 'github',
	cacheKey: 'github:acme/docs',
	label: 'acme/docs'
} as never;

describe('repository-data route data', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCollectionNavigation).mockResolvedValue(null);
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue(null);
		vi.mocked(getSingletonConfigStates).mockResolvedValue(null);
		vi.mocked(getSingletonDocument).mockResolvedValue(null);
		clearWorkflowInstrumentationEventsForTests();
	});

	it('falls back to legacy content cache for collection navigation when indexing cannot answer', async () => {
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		const result = await resolveCollectionNavigationForRoute({
			backend,
			discoveredConfig: collectionConfig as never,
			navigationManifest: null,
			rootConfig: null
		});

		expect(result).toMatchObject({
			source: 'legacy-content-cache',
			navigation: {
				items: [
					{
						itemId: 'hello-world',
						title: 'Hello world',
						sortDate: null,
						sortValues: {
							title: 'Hello world'
						}
					}
				],
				groups: []
			},
			workflowData: {
				slug: 'posts',
				readiness: 'ready',
				cacheMiss: {
					target: 'collection-navigation',
					slug: 'posts',
					reason: 'prepared collection navigation unavailable'
				}
			}
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			collectionConfig.config,
			collectionConfig.path,
			collectionConfig.slug
		);
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'route-data-fallback',
					route: '/pages/posts',
					slug: 'posts',
					source: 'legacy-content-cache',
					reason: 'collection navigation index unavailable'
				})
			])
		);
	});

	it('uses repository-data collection navigation when available', async () => {
		vi.mocked(getCollectionNavigation).mockResolvedValue({
			items: [
				{
					itemId: 'hello-world',
					title: 'Hello world',
					sortDate: null
				}
			],
			groups: []
		});

		const result = await resolveCollectionNavigationForRoute({
			backend,
			discoveredConfig: collectionConfig as never,
			navigationManifest: null,
			rootConfig: null
		});

		expect(result).toMatchObject({
			source: 'repository-data',
			navigation: {
				items: [
					{
						itemId: 'hello-world',
						title: 'Hello world',
						sortDate: null
					}
				],
				groups: []
			},
			workflowData: {
				slug: 'posts',
				readiness: 'ready',
				cacheMiss: null
			}
		});
		expect(getCollectionNavigation).toHaveBeenCalledWith({
			backend,
			slug: 'posts'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
	});

	it('falls back to legacy content cache for singleton page content when indexing cannot answer', async () => {
		vi.mocked(getCachedContent).mockResolvedValue({
			title: 'About from legacy cache'
		});

		const result = await resolvePageViewContentForRoute({
			backend,
			discoveredConfig: singletonConfig as never
		});

		expect(result).toMatchObject({
			source: 'legacy-content-cache',
			content: {
				title: 'About from legacy cache'
			},
			collectionNavigation: null,
			workflowData: {
				slug: 'about',
				readiness: 'ready',
				cacheMiss: {
					target: 'page-view',
					slug: 'about',
					reason: 'prepared page view unavailable'
				}
			}
		});
		expect(getSingletonDocument).toHaveBeenCalledWith({
			backend,
			slug: 'about'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			singletonConfig.config,
			singletonConfig.path,
			singletonConfig.slug
		);
	});

	it('falls back to legacy content cache for singleton config states when indexing cannot answer', async () => {
		vi.mocked(getCachedContent).mockResolvedValue({
			title: 'About',
			published: false
		});

		const result = await resolveSingletonConfigStatesForRoute({
			backend,
			configs: [singletonConfig] as never,
			rootConfig: null
		});

		expect(result).toMatchObject({
			source: 'legacy-content-cache',
			stateConfigCount: 1,
			statesBySlug: {
				about: {
					value: false,
					label: 'Draft',
					variant: 'warning',
					icon: 'file-pen',
					visibility: {
						navigation: true,
						header: true,
						card: true
					}
				}
			},
			workflowData: {
				readiness: 'ready',
				stateConfigCount: 1,
				cacheMiss: {
					target: 'config-states',
					reason: 'prepared config states unavailable'
				}
			}
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			singletonConfig.config,
			singletonConfig.path,
			singletonConfig.slug
		);
	});

	it('uses repository-data for collection item route lookups when available', async () => {
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue({
			config: collectionConfig,
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'blob-hello-world',
				title: 'Hello world',
				sortDate: null
			},
			content: {
				title: 'Hello world'
			}
		} as never);

		const result = await resolveCollectionItemForRoute({
			backend,
			discoveredConfig: collectionConfig as never,
			itemId: 'hello-world'
		});

		expect(result).toEqual({
			title: 'Hello world'
		});
		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend,
			slug: 'posts',
			itemId: 'hello-world'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
	});

	it('exposes mode-neutral workflow data for collection item route lookups', async () => {
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue({
			config: collectionConfig,
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'blob-hello-world',
				title: 'Hello world',
				sortDate: null
			},
			content: {
				title: 'Hello world'
			}
		} as never);

		const result = await resolveCollectionItemRouteData({
			backend,
			discoveredConfig: collectionConfig as never,
			itemId: 'hello-world'
		});

		expect(result).toMatchObject({
			source: 'repository-data',
			item: {
				title: 'Hello world'
			},
			workflowData: {
				slug: 'posts',
				itemId: 'hello-world',
				item: {
					title: 'Hello world'
				},
				readiness: 'ready',
				cacheMiss: null
			}
		});
	});

	it('falls back to legacy collection lookup for unsupported item resolvers', async () => {
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				title: 'First item'
			}
		]);

		const result = await resolveCollectionItemForRoute({
			backend,
			discoveredConfig: fileCollectionConfig as never,
			itemId: '0'
		});

		expect(result).toEqual({
			title: 'First item'
		});
		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend,
			slug: 'posts',
			itemId: '0'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			fileCollectionConfig.config,
			fileCollectionConfig.path,
			fileCollectionConfig.slug
		);
	});
});
