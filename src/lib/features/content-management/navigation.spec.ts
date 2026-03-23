import { describe, expect, it } from 'vitest';
import {
	getCollectionNavigationItems,
	getConfigItemLabel,
	getContentItemTitle
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
			{ itemId: 'hello-world', title: 'Hello World' },
			{ itemId: 'second-post', title: 'Second Post' }
		]);
	});
});
