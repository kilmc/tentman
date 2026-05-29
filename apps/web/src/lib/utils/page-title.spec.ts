import { describe, expect, it } from 'vitest';
import type { ParsedContentConfig } from '$lib/config/parse';
import {
	buildContentTitleContext,
	formatAppTitle,
	formatDocsTitle
} from '$lib/utils/page-title';

const blogConfig: ParsedContentConfig = {
	type: 'content',
	label: 'Blog Posts',
	itemLabel: 'Blog Post',
	collection: true,
	content: {
		mode: 'directory',
		path: './src/content/posts',
		template: './templates/post.md'
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title' },
		{ id: 'slug', type: 'text', label: 'Slug' }
	]
};

describe('page title helpers', () => {
	it('formats app titles with site context', () => {
		expect(formatAppTitle('Review Draft', 'My Site')).toBe('Review Draft | My Site | Tentman');
	});

	it('dedupes repeated Tentman segments', () => {
		expect(formatAppTitle('Tentman', 'Tentman')).toBe('Tentman');
	});

	it('formats docs titles separately from site titles', () => {
		expect(formatDocsTitle('Routing Guide')).toBe('Routing Guide | Tentman docs');
	});

	it('builds specific item titles with collection context', () => {
		expect(
			buildContentTitleContext({
				kind: 'edit-item',
				config: blogConfig,
				item: {
					title: 'Hello World',
					slug: 'hello-world'
				}
			})
		).toBe('Edit Hello World | Blog Posts');
	});

	it('falls back to generic item labels when no real item title exists', () => {
		expect(
			buildContentTitleContext({
				kind: 'edit-item',
				config: blogConfig,
				item: {
					slug: 'hello-world'
				}
			})
		).toBe('Edit Blog Post');
	});

	it('uses singular item labels for new collection items', () => {
		expect(
			buildContentTitleContext({
				kind: 'new-item',
				config: blogConfig
			})
		).toBe('New Blog Post');
	});

	it('uses explicit preview wording for preview routes', () => {
		expect(
			buildContentTitleContext({
				kind: 'preview-page',
				config: blogConfig
			})
		).toBe('Preview Changes for Blog Posts');
	});
});
