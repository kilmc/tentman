import { describe, expect, it } from 'vitest';
import {
	getDiscoverableBlockConfigPaths,
	getDiscoverableContentConfigPaths,
	parseDiscoveredBlockConfig,
	parseDiscoveredConfig
} from '$lib/config/discovery';

describe('getDiscoverableContentConfigPaths', () => {
	it('filters by root discovery rules', () => {
		const paths = [
			'.tentman.json',
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
			'.tentman.json',
			'tentman/configs/posts.tentman.json',
			'tentman/blocks/seo.tentman.json',
			'tentman/blocks/media/gallery.tentman.json',
			'src/legacy.tentman.json'
		];

		expect(
			getDiscoverableBlockConfigPaths(paths, {
				blocksDir: './tentman/blocks'
			})
		).toEqual([
			'tentman/blocks/seo.tentman.json',
			'tentman/blocks/media/gallery.tentman.json'
		]);
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
		if (!('contentFile' in discovered.config)) {
			throw new Error('Expected file-backed content config');
		}
		expect(discovered.config.contentFile).toBe('./src/content/site.json');
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
		expect(discovered.config.fields.metaTitle).toMatchObject({
			type: 'text',
			label: 'Meta Title'
		});
	});
});
