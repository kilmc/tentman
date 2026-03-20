import { describe, expect, it, vi } from 'vitest';
import {
	createBlockRegistry,
	loadBlockRegistry,
	type LoadBlockRegistryOptions
} from '$lib/blocks/registry';
import { parseDiscoveredBlockConfig } from '$lib/config/discovery';
import type { RepositoryBackend } from '$lib/repository/types';

describe('createBlockRegistry', () => {
	it('includes built-in blocks and local block configs', () => {
		const registry = createBlockRegistry([
			parseDiscoveredBlockConfig(
				'tentman/blocks/seo.tentman.json',
				`{
					"type": "block",
					"id": "seo",
					"label": "SEO",
					"blocks": [
						{ "id": "metaTitle", "type": "text", "label": "Meta Title" }
					]
				}`
			)
		]);

		expect(registry.has('text')).toBe(true);
		expect(registry.has('seo')).toBe(true);
		expect(registry.get('seo')).toMatchObject({
			id: 'seo',
			kind: 'local',
			path: 'tentman/blocks/seo.tentman.json'
		});
		expect(registry.getAdapter('text')?.getDefaultValue({ id: 'title', type: 'text' })).toBe('');
		expect(registry.getAdapter('seo')?.getDefaultValue({ id: 'seo', type: 'seo' })).toEqual({
			metaTitle: ''
		});
	});

	it('fails fast when local block ids duplicate each other', () => {
		expect(() =>
			createBlockRegistry([
				parseDiscoveredBlockConfig(
					'tentman/blocks/seo.tentman.json',
					`{
						"type": "block",
						"id": "seo",
						"label": "SEO",
						"blocks": [{ "id": "metaTitle", "type": "text" }]
					}`
				),
				parseDiscoveredBlockConfig(
					'tentman/blocks/marketing/seo.tentman.json',
					`{
						"type": "block",
						"id": "seo",
						"label": "Marketing SEO",
						"blocks": [{ "id": "metaDescription", "type": "text" }]
					}`
				)
			])
		).toThrow(/Duplicate block id "seo"/);
	});

	it('fails fast when a local block reuses a built-in id', () => {
		expect(() =>
			createBlockRegistry([
				parseDiscoveredBlockConfig(
					'tentman/blocks/text.tentman.json',
					`{
						"type": "block",
						"id": "text",
						"label": "Custom Text",
						"blocks": [{ "id": "value", "type": "text" }]
					}`
				)
			])
		).toThrow(/Duplicate block id "text"/);
	});
});

describe('loadBlockRegistry', () => {
	function createBackend(blockConfigs: string[]): RepositoryBackend {
		return {
			kind: 'local',
			cacheKey: 'local:test',
			label: 'Test repo',
			supportsDraftBranches: false,
			async discoverConfigs() {
				return [];
			},
			async discoverBlockConfigs() {
				return blockConfigs.map((content, index) =>
					parseDiscoveredBlockConfig(`tentman/blocks/block-${index + 1}.tentman.json`, content)
				);
			},
			async readRootConfig() {
				return null;
			},
			async readTextFile() {
				return '';
			},
			async writeTextFile() {},
			async deleteFile() {},
			async listDirectory() {
				return [];
			},
			async fileExists() {
				return false;
			}
		};
	}

	it('loads a custom adapter module relative to the declaring block config file', async () => {
		const backend = createBackend([
			`{
				"type": "block",
				"id": "gallery",
				"label": "Gallery",
				"adapter": "./gallery.adapter.js",
				"blocks": [{ "id": "image", "type": "image" }]
			}`
		]);

		const loadLocalAdapterModule: NonNullable<LoadBlockRegistryOptions['loadLocalAdapterModule']> = vi
			.fn()
			.mockResolvedValue({
				adapter: {
					type: 'gallery',
					getDefaultValue() {
						return ['custom'];
					},
					validate() {
						return [];
					}
				}
			});

		const registry = await loadBlockRegistry(backend, { loadLocalAdapterModule });

		expect(loadLocalAdapterModule).toHaveBeenCalledWith('tentman/blocks/gallery.adapter.js');
		expect(registry.get('gallery')).toMatchObject({
			id: 'gallery',
			kind: 'local',
			path: 'tentman/blocks/block-1.tentman.json',
			adapterPath: 'tentman/blocks/gallery.adapter.js'
		});
		expect(registry.getAdapter('gallery')?.getDefaultValue({ id: 'gallery', type: 'gallery' })).toEqual([
			'custom'
		]);
	});

	it('fails when a custom adapter module does not export a named adapter', async () => {
		const backend = createBackend([
			`{
				"type": "block",
				"id": "gallery",
				"label": "Gallery",
				"adapter": "./gallery.adapter.js",
				"blocks": [{ "id": "image", "type": "image" }]
			}`
		]);

		await expect(
			loadBlockRegistry(backend, {
				loadLocalAdapterModule: vi.fn().mockResolvedValue({})
			})
		).rejects.toThrow(/must export a named "adapter"/);
	});

	it('fails when a custom adapter module exports the wrong block type', async () => {
		const backend = createBackend([
			`{
				"type": "block",
				"id": "gallery",
				"label": "Gallery",
				"adapter": "./gallery.adapter.js",
				"blocks": [{ "id": "image", "type": "image" }]
			}`
		]);

		await expect(
			loadBlockRegistry(backend, {
				loadLocalAdapterModule: vi.fn().mockResolvedValue({
					adapter: {
						type: 'seo',
						getDefaultValue() {
							return {};
						}
					}
				})
			})
		).rejects.toThrow(/must use type "gallery"/);
	});
});
