import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getCollectionNavigation: vi.fn(async () => null),
	getSingletonConfigStates: vi.fn(async () => null),
	getSingletonDocument: vi.fn(async () => null)
}));

import {
	resolveCollectionItemForRoute,
	resolveCollectionNavigationForRoute,
	resolvePageViewContentForRoute,
	resolveSingletonConfigStatesForRoute
} from './route-fallbacks';
import {
	getCollectionNavigation,
	getSingletonConfigStates,
	getSingletonDocument
} from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';

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

describe('repository-data route fallbacks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCollectionNavigation).mockResolvedValue(null);
		vi.mocked(getSingletonConfigStates).mockResolvedValue(null);
		vi.mocked(getSingletonDocument).mockResolvedValue(null);
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

		expect(result).toEqual({
			source: 'legacy-content-cache',
			navigation: {
				items: [
					{
						itemId: 'hello-world',
						title: 'Hello world',
						sortDate: null
					}
				],
				groups: []
			}
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			collectionConfig.config,
			collectionConfig.path,
			collectionConfig.slug
		);
	});

	it('falls back to legacy content cache for singleton page content when indexing cannot answer', async () => {
		vi.mocked(getCachedContent).mockResolvedValue({
			title: 'About from legacy cache'
		});

		const result = await resolvePageViewContentForRoute({
			backend,
			discoveredConfig: singletonConfig as never
		});

		expect(result).toEqual({
			source: 'legacy-content-cache',
			content: {
				title: 'About from legacy cache'
			},
			collectionNavigation: null
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

		expect(result).toEqual({
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
			}
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			singletonConfig.config,
			singletonConfig.path,
			singletonConfig.slug
		);
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
		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			fileCollectionConfig.config,
			fileCollectionConfig.path,
			fileCollectionConfig.slug
		);
	});
});
