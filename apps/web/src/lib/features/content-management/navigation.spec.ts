import { describe, expect, it } from 'vitest';
import {
	getCollectionNavigationItems,
	getConfigItemLabel,
	getContentItemTitle,
	getOrderedCollectionNavigation,
	orderDiscoveredConfigs,
	resolveContentItemTitle
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
	editorLayout: {
		aside: ['slug']
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title' },
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

	it('uses an explicit text item label before the existing title heuristic', () => {
		expect(
			resolveContentItemTitle(
				{
					...collectionConfig,
					blocks: [
						{ id: 'title', type: 'text', label: 'Title' },
						{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true }
					]
				},
				{
					_tentmanId: 'post-1',
					title: 'Hello World',
					summary: '  Launch   update \n now '
				}
			)
		).toEqual({
			title: 'Launch update now',
			usedFallback: false,
			sourceBlockId: 'summary',
			sourceType: 'text'
		});
	});

	it('falls back to the existing heuristic when an explicit text label is blank', () => {
		expect(
			resolveContentItemTitle(
				{
					...collectionConfig,
					blocks: [
						{ id: 'title', type: 'text', label: 'Title' },
						{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true }
					]
				},
				{
					_tentmanId: 'post-1',
					title: 'Hello World',
					summary: '   '
				}
			)
		).toEqual({
			title: 'Hello World',
			usedFallback: false
		});
	});

	it('formats explicit date item labels with the requested locale and format', () => {
		expect(
			resolveContentItemTitle(
				{
					...collectionConfig,
					blocks: [
						{
							id: 'publishedOn',
							type: 'date',
							label: 'Published On',
							isItemLabel: true,
							itemLabelFormat: {
								month: 'short',
								day: 'numeric',
								year: 'numeric'
							}
						}
					]
				},
				{
					_tentmanId: 'post-1',
					publishedOn: '2026-04-03'
				},
				{ locales: 'en-US' }
			)
		).toEqual({
			title: 'Apr 3, 2026',
			usedFallback: false,
			sourceBlockId: 'publishedOn',
			sourceType: 'date'
		});
	});

	it('falls back to default date formatting when itemLabelFormat is invalid', () => {
		expect(
			resolveContentItemTitle(
				{
					...collectionConfig,
					blocks: [
						{
							id: 'publishedOn',
							type: 'date',
							label: 'Published On',
							isItemLabel: true,
							itemLabelFormat: { month: 'not-a-real-month' } as never
						},
						{ id: 'title', type: 'text', label: 'Title' }
					]
				},
				{
					_tentmanId: 'post-1',
					title: 'Hello World',
					publishedOn: '2026-04-03'
				},
				{ locales: 'en-US' }
			)
		).toEqual({
			title: 'April 3, 2026',
			usedFallback: false,
			sourceBlockId: 'publishedOn',
			sourceType: 'date'
		});
	});

	it('ignores explicit item labels when a schema unit declares more than one', () => {
		expect(
			resolveContentItemTitle(
				{
					...collectionConfig,
					blocks: [
						{ id: 'title', type: 'text', label: 'Title' },
						{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true },
						{ id: 'publishedOn', type: 'date', label: 'Published On', isItemLabel: true }
					]
				},
				{
					_tentmanId: 'post-1',
					title: 'Hello World',
					summary: 'Should be ignored',
					publishedOn: '2026-04-03'
				}
			)
		).toEqual({
			title: 'Hello World',
			usedFallback: false
		});
	});

	it('reports when an item title came from fallback data', () => {
		expect(
			resolveContentItemTitle(collectionConfig, {
				_tentmanId: 'post-1',
				slug: 'hello-world'
			})
		).toEqual({
			title: 'hello-world',
			usedFallback: true
		});
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

	it('falls back to route ids for non-manual collections when Tentman ids are missing', () => {
		expect(
			getCollectionNavigationItems(
				{
					...collectionConfig,
					collection: true,
					blocks: [
						{ id: 'title', type: 'text', label: 'Title' },
						{ id: 'date', type: 'date', label: 'Date' }
					]
				},
				[
					{ title: 'Latest News', _filename: 'latest-news.md', date: '2026-04-03' },
					{ title: 'Earlier News', _filename: 'earlier-news.md', date: '2026-03-01' }
				]
			)
		).toEqual([
			{ itemId: 'latest-news', title: 'Latest News', sortDate: new Date('2026-04-03').getTime() },
			{ itemId: 'earlier-news', title: 'Earlier News', sortDate: new Date('2026-03-01').getTime() }
		]);
	});

	it('still requires Tentman ids when manual collection sorting is enabled', () => {
		expect(
			getCollectionNavigationItems(collectionConfig, [
				{ title: 'Latest News', slug: 'latest-news' }
			])
		).toEqual([]);
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
