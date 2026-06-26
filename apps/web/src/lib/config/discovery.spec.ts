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

	it('warns when discovered configs use legacy assetsDir', () => {
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
					{ "id": "hero", "type": "image", "assetsDir": "./static/images" }
				]
			}`
		);

		expect(discovered.issues).toEqual([
			expect.objectContaining({
				code: 'assets.legacy-assets-dir',
				severity: 'warning',
				category: 'compatibility',
				blockId: 'hero'
			})
		]);
	});

	it('warns and ignores unsupported explicit item label sources', () => {
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
					{ "id": "body", "type": "markdown", "label": "Body", "isItemLabel": true }
				]
			}`
		);

		expect(discovered.issues).toEqual([
			expect.objectContaining({
				code: 'item-label.unsupported-source-type',
				severity: 'warning',
				category: 'structural',
				blockId: 'body'
			})
		]);
	});

	it('treats parent and child schema units as independent for explicit item labels', () => {
		const discovered = parseDiscoveredConfig(
			'tentman/configs/faq.tentman.json',
			`{
				"type": "content",
				"label": "FAQ",
				"content": {
					"mode": "file",
					"path": "./src/content/faq.json"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title", "isItemLabel": true },
					{
						"id": "sections",
						"type": "block",
						"label": "Sections",
						"collection": true,
						"blocks": [
							{ "id": "heading", "type": "text", "label": "Heading", "isItemLabel": true }
						]
					}
				]
			}`
		);

		expect(discovered.issues).toEqual([]);
	});

	it('warns once per schema unit when multiple explicit item labels are declared', () => {
		const discovered = parseDiscoveredBlockConfig(
			'tentman/blocks/gallery.tentman.json',
			`{
				"type": "block",
				"id": "gallery",
				"label": "Gallery",
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title", "isItemLabel": true },
					{ "id": "caption", "type": "text", "label": "Caption", "isItemLabel": true },
					{
						"id": "images",
						"type": "block",
						"label": "Images",
						"collection": true,
						"blocks": [
							{ "id": "alt", "type": "text", "label": "Alt", "isItemLabel": true },
							{ "id": "takenOn", "type": "date", "label": "Taken on", "isItemLabel": true }
						]
					}
				]
			}`
		);

		expect(discovered.issues).toEqual([
			expect.objectContaining({
				code: 'item-label.multiple-explicit-sources',
				severity: 'warning',
				category: 'structural',
				blockId: 'title'
			}),
			expect.objectContaining({
				code: 'item-label.multiple-explicit-sources',
				severity: 'warning',
				category: 'structural',
				blockId: 'alt'
			})
		]);
	});

	it('warns when itemLabelFormat is used outside a date item label source', () => {
		const discovered = parseDiscoveredConfig(
			'tentman/configs/events.tentman.json',
			`{
				"type": "content",
				"label": "Events",
				"content": {
					"mode": "file",
					"path": "./src/content/events.json"
				},
				"blocks": [
					{
						"id": "title",
						"type": "text",
						"label": "Title",
						"isItemLabel": true,
						"itemLabelFormat": { "month": "short" }
					}
				]
			}`
		);

		expect(discovered.issues).toEqual([
			expect.objectContaining({
				code: 'item-label.invalid-format-target',
				severity: 'warning',
				category: 'structural',
				blockId: 'title'
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
