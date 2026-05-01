import { describe, expect, it } from 'vitest';
import {
	getCollectionNavigationItems,
	getConfigItemLabel,
	getContentItemTitle,
	getOrderedCollectionNavigation,
	orderDiscoveredConfigs
} from '$lib/features/content-management/navigation';
import type { ParsedContentConfig } from '$lib/config/parse';

const collectionConfig: ParsedContentConfig = {
	type: 'content',
	label: 'Blog Posts',
	_tentmanId: 'posts',
	itemLabel: 'Blog Post',
	collection: {
		sorting: 'manual',
		groups: [{ _tentmanId: 'featured', label: 'Featured', value: 'featured' }],
		state: {
			blockId: 'published',
			preset: 'publication'
		}
	},
	idField: 'slug',
	content: {
		mode: 'directory',
		path: './src/content/posts',
		template: './templates/post.md'
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title', show: 'primary' },
		{ id: 'slug', type: 'text', label: 'Slug' },
		{ id: 'published', type: 'toggle', label: 'Published' }
	]
};

describe('content navigation helpers', () => {
	it('prefers the explicit item label', () => {
		expect(getConfigItemLabel(collectionConfig)).toBe('Blog Post');
	});

	it('falls back to a singularized config label', () => {
		expect(
			getConfigItemLabel({
				...collectionConfig,
				label: 'Pages',
				itemLabel: undefined
			})
		).toBe('Page');
	});

	it('builds item titles from visible content fields', () => {
		expect(
			getContentItemTitle(collectionConfig, {
				_tentmanId: 'post-1',
				title: 'Hello World',
				slug: 'hello-world'
			})
		).toBe('Hello World');
	});

	it('falls back to the item route when a visible title is missing', () => {
		expect(
			getContentItemTitle(collectionConfig, { _tentmanId: 'post-1', slug: 'hello-world' })
		).toBe('hello-world');
	});

	it('builds collection navigation items with stable ids and titles', () => {
		expect(
			getCollectionNavigationItems(collectionConfig, [
				{ _tentmanId: 'post-1', title: 'Hello World', slug: 'hello-world' },
				{ _tentmanId: 'post-2', title: 'Second Post', slug: 'second-post' }
			])
		).toEqual([
			{ itemId: 'post-1', title: 'Hello World', sortDate: null },
			{ itemId: 'post-2', title: 'Second Post', sortDate: null }
		]);
	});

	it('includes matched collection state when collection items resolve a preset case', () => {
		expect(
			getCollectionNavigationItems(
				collectionConfig,
				[{ _tentmanId: 'post-1', title: 'Hello World', slug: 'hello-world', published: false }],
				{
					statePresets: {
						publication: {
							cases: [
								{ value: false, label: 'Draft', variant: 'warning', icon: 'file-pen' }
							]
						}
					}
				}
			)
		).toEqual([
			{
				itemId: 'post-1',
				title: 'Hello World',
				sortDate: null,
				state: {
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
		]);
	});

	it('orders top-level configs from the manifest and appends unlisted configs', () => {
		expect(
			orderDiscoveredConfigs(
				[
					{
						slug: 'about',
						path: 'content/about.tentman.json',
						config: {
							...collectionConfig,
							_tentmanId: 'about',
							collection: false,
							label: 'About'
						}
					},
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							...collectionConfig,
							_tentmanId: 'posts'
						}
					},
					{
						slug: 'contact',
						path: 'content/contact.tentman.json',
						config: {
							...collectionConfig,
							_tentmanId: 'contact',
							collection: false,
							label: 'Contact'
						}
					}
				],
				{
					version: 1,
					content: {
						items: ['posts', 'about']
					}
				},
				{ content: { sorting: 'manual' } }
			).map((config) => config.slug)
		).toEqual(['posts', 'about', 'contact']);
	});

	it('uses grouped collection navigation from the manifest and appends ungrouped items', () => {
		expect(
			getOrderedCollectionNavigation(
				collectionConfig,
				[
					{ _tentmanId: 'post-1', title: 'Hello World', slug: 'hello-world' },
					{ _tentmanId: 'post-2', title: 'Second Post', slug: 'second-post' },
					{ _tentmanId: 'post-3', title: 'Third Post', slug: 'third-post' }
				],
				{
					version: 1,
					collections: {
						posts: {
							items: ['post-2', 'post-1'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['post-2']
								}
							]
						}
					}
				}
			)
		).toEqual({
			groups: [
				{
					id: 'featured',
					label: 'Featured',
					items: [{ itemId: 'post-2', title: 'Second Post', sortDate: null }]
				}
			],
			items: [
				{ itemId: 'post-1', title: 'Hello World', sortDate: null },
				{ itemId: 'post-3', title: 'Third Post', sortDate: null }
			]
		});
	});
});
