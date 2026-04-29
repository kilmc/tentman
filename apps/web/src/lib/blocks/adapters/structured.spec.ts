import { describe, expect, it } from 'vitest';
import { createBlockRegistry, resolveBlockAdapterForUsage } from '$lib/blocks/registry';
import { parseDiscoveredBlockConfig } from '$lib/config/discovery';
import { parseConfigFile } from '$lib/config/parse';
import { buildFormData } from '$lib/features/forms/helpers';
import { validateFormData } from '$lib/utils/validation';

describe('structured block adapters', () => {
	it('builds nested defaults for inline block definitions', () => {
		const config = parseConfigFile(`{
			"type": "content",
			"label": "Pages",
			"content": { "mode": "file", "path": "./pages.json" },
			"blocks": [
				{
					"id": "seo",
					"type": "block",
					"label": "SEO",
					"blocks": [
						{ "id": "title", "type": "text", "label": "Title" },
						{ "id": "description", "type": "textarea", "label": "Description" }
					]
				}
			]
		}`);

		if (config.type !== 'content') {
			throw new Error('Expected content config');
		}

		const registry = createBlockRegistry([]);
		const adapter = resolveBlockAdapterForUsage(config.blocks[0], registry);

		expect(adapter?.getDefaultValue(config.blocks[0])).toEqual({
			title: '',
			description: ''
		});
	});

	it('builds defaults for reusable local block configs', () => {
		const registry = createBlockRegistry([
			parseDiscoveredBlockConfig(
				'tentman/blocks/seo.tentman.json',
				`{
					"type": "block",
					"id": "seo",
					"label": "SEO",
					"blocks": [
						{ "id": "metaTitle", "type": "text", "label": "Meta Title", "required": true },
						{ "id": "metaDescription", "type": "textarea", "label": "Meta Description" }
					]
				}`
			)
		]);

		expect(registry.getAdapter('seo')?.getDefaultValue({ id: 'seo', type: 'seo' })).toEqual({
			metaTitle: '',
			metaDescription: ''
		});
	});

	it('recurses through nested adapters for defaults and validation', () => {
		const registry = createBlockRegistry([
			parseDiscoveredBlockConfig(
				'tentman/blocks/seo.tentman.json',
				`{
					"type": "block",
					"id": "seo",
					"label": "SEO",
					"blocks": [
						{ "id": "metaTitle", "type": "text", "label": "Meta Title", "required": true }
					]
				}`
			)
		]);

		const config = parseConfigFile(`{
			"type": "content",
			"label": "Pages",
			"content": { "mode": "file", "path": "./pages.json" },
			"blocks": [
				{ "id": "seo", "type": "seo", "label": "SEO" },
				{
					"id": "gallery",
					"type": "block",
					"label": "Gallery",
					"collection": true,
					"blocks": [
						{ "id": "caption", "type": "text", "label": "Caption", "required": true }
					]
				}
			]
		}`);

		if (config.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(buildFormData(config, {}, registry)).toEqual({
			seo: { metaTitle: '' },
			gallery: []
		});

		expect(
			validateFormData(
				config,
				{
					seo: { metaTitle: '' },
					gallery: [{ caption: '' }, { caption: 'ok' }]
				},
				undefined,
				registry
			)
		).toEqual([
			{ field: 'seo', message: 'Meta Title is required' },
			{ field: 'gallery', message: 'Gallery item 1: Caption is required' }
		]);
	});

	it('preserves nested select options during validation', () => {
		const config = parseConfigFile(`{
			"type": "content",
			"label": "Projects",
			"content": { "mode": "file", "path": "./projects.json" },
			"blocks": [
				{
					"id": "gallery",
					"type": "block",
					"label": "Gallery",
					"blocks": [
						{
							"id": "layout",
							"type": "select",
							"label": "Layout",
							"required": true,
							"options": ["stack", "inline"]
						}
					]
				}
			]
		}`);

		if (config.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(
			validateFormData(
				config,
				{
					gallery: { layout: 'inline' }
				},
				undefined,
				createBlockRegistry([])
			)
		).toEqual([]);
	});
});
