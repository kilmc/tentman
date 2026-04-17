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
	itemLabel: 'Blog Post',
	collection: true,
	idField: 'slug',
	content: {
		mode: 'directory',
		path: './src/content/posts',
		template: './templates/post.md'
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title', show: 'primary' },
		{ id: 'slug', type: 'text', label: 'Slug' }
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
			getContentItemTitle(collectionConfig, { title: 'Hello World', slug: 'hello-world' })
		).toBe('Hello World');
	});

	it('falls back to the item id when a visible title is missing', () => {
		expect(getContentItemTitle(collectionConfig, { slug: 'hello-world' })).toBe('hello-world');
	});

	it('builds collection navigation items with ids and titles', () => {
		expect(
			getCollectionNavigationItems(collectionConfig, [
				{ title: 'Hello World', slug: 'hello-world' },
				{ title: 'Second Post', slug: 'second-post' }
			])
		).toEqual([
			{ itemId: 'hello-world', title: 'Hello World', sortDate: null },
			{ itemId: 'second-post', title: 'Second Post', sortDate: null }
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
							id: 'about',
							label: 'About'
						}
					},
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							...collectionConfig,
							id: 'posts'
						}
					},
					{
						slug: 'contact',
						path: 'content/contact.tentman.json',
						config: {
							...collectionConfig,
							id: 'contact',
							label: 'Contact'
						}
					}
				],
				{
					version: 1,
					content: {
						items: ['posts', 'about']
					}
				}
			).map((config) => config.slug)
		).toEqual(['posts', 'about', 'contact']);
	});

	it('uses grouped collection navigation from the manifest and appends ungrouped items', () => {
		expect(
			getOrderedCollectionNavigation(
				{
					...collectionConfig,
					id: 'posts'
				},
				[
					{ title: 'Hello World', slug: 'hello-world' },
					{ title: 'Second Post', slug: 'second-post' },
					{ title: 'Third Post', slug: 'third-post' }
				],
				{
					version: 1,
					collections: {
						posts: {
							items: ['second-post', 'hello-world'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['second-post']
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
					items: [{ itemId: 'second-post', title: 'Second Post', sortDate: null }]
				}
			],
			items: [
				{ itemId: 'hello-world', title: 'Hello World', sortDate: null },
				{ itemId: 'third-post', title: 'Third Post', sortDate: null }
			]
		});
	});
});
