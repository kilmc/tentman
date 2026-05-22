import { describe, expect, it } from 'vitest';
import { normalizeFields } from '$lib/config/fields-compat';
import {
	getDiscoverableBlockConfigPaths,
	getDiscoverableContentConfigPaths,
	parseDiscoveredBlockConfig,
	parseDiscoveredConfig
} from '$lib/config/discovery';

describe('getDiscoverableContentConfigPaths', () => {
	it('filters by root discovery rules', () => {
		const paths = [
			'tentman.json',
			'tentman/tentman.json',
			'tentman/configs/posts.tentman.json',
			'tentman/configs/_draft.tentman.json',
			'tentman/blocks/seo.tentman.json',
			'src/legacy.tentman.json'
		];

		expect(
			getDiscoverableContentConfigPaths(paths, {
				configsDir: './tentman/configs',
				blocksDir: './tentman/blocks'
			})
		).toEqual(['tentman/configs/posts.tentman.json']);
	});
});

describe('getDiscoverableBlockConfigPaths', () => {
	it('returns block configs only from blocksDir', () => {
		const paths = [
			'tentman.json',
			'tentman/tentman.json',
			'tentman/configs/posts.tentman.json',
			'tentman/blocks/seo.tentman.json',
			'tentman/blocks/media/gallery.tentman.json',
			'src/legacy.tentman.json'
		];

		expect(
			getDiscoverableBlockConfigPaths(paths, {
				blocksDir: './tentman/blocks'
			})
		).toEqual(['tentman/blocks/seo.tentman.json', 'tentman/blocks/media/gallery.tentman.json']);
	});
});

describe('parseDiscoveredConfig', () => {
	it('returns a discovered content config without duplicating runtime type metadata', () => {
		const discovered = parseDiscoveredConfig(
			'tentman/configs/site.tentman.json',
			`{
				"type": "content",
				"label": "Site Settings",
				"content": {
					"mode": "file",
					"path": "./src/content/site.json"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" }
				]
			}`
		);

		expect(discovered.slug).toBe('site-settings');
		if (discovered.config.content.mode !== 'file') {
			throw new Error('Expected file-backed content config');
		}
		expect(discovered.config.content.path).toBe('./src/content/site.json');
	});

	it('accepts legacy discovered content configs', () => {
		const discovered = parseDiscoveredConfig(
			'src/lib/db/posts/posts.tentman.json',
			`{
				"label": "Blog Posts",
				"template": "./post.template.md",
				"filename": "{{slug}}",
				"fields": [
					{ "property": "title", "label": "Title", "type": "text" },
					{ "property": "slug", "label": "Slug", "type": "text" },
					{ "property": "_body", "label": "Content", "type": "markdown" }
				]
			}`
		);

		expect(discovered.slug).toBe('blog-posts');
		expect(discovered.config.type).toBe('content');
		expect(discovered.config.blocks.at(-1)).toMatchObject({
			id: 'body',
			type: 'markdown'
		});
	});

	it('surfaces compatibility issues without dropping discovered configs', () => {
		const discovered = parseDiscoveredConfig(
			'tentman/configs/projects.tentman.json',
			`{
				"type": "content",
				"label": "Projects",
				"content": {
					"mode": "file",
					"path": "./src/content/projects.json"
				},
				"blocks": [
					{
						"id": "gallery",
						"type": "block",
						"referenceFor": "gallery-embed:galleryRef",
						"blocks": [{ "id": "title", "type": "text" }]
					}
				]
			}`
		);

		expect(discovered.slug).toBe('projects');
		expect(discovered.issues).toEqual([
			expect.objectContaining({
				code: 'content-components.reference-binding.selector-on-structured',
				severity: 'warning',
				category: 'compatibility',
				blockId: 'gallery'
			})
		]);
	});
});

describe('parseDiscoveredBlockConfig', () => {
	it('returns a discovered block config', () => {
		const discovered = parseDiscoveredBlockConfig(
			'tentman/blocks/seo.tentman.json',
			`{
				"type": "block",
				"id": "seo",
				"label": "SEO",
				"blocks": [
					{ "id": "metaTitle", "type": "text", "label": "Meta Title" }
				]
			}`
		);

		expect(discovered.id).toBe('seo');
		expect(discovered.config.type).toBe('block');
		expect(normalizeFields(discovered.config.blocks).metaTitle).toMatchObject({
			type: 'text',
			label: 'Meta Title'
		});
	});
});
