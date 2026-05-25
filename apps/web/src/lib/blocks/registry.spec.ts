import { describe, expect, it, vi } from 'vitest';
import { createBlockRegistry, loadBlockRegistry, type LoadBlockRegistryOptions } from '$lib/blocks/registry';
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
	function createBackend(
		blockConfigs: string[],
		rootConfig: Record<string, unknown> | null = null
	): RepositoryBackend {
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
				return rootConfig as Awaited<ReturnType<RepositoryBackend['readRootConfig']>>;
			},
			async readTextFile() {
				return '';
			},
			async writeTextFile() {},
			async writeBinaryFile() {},
			async deleteFile() {},
			async listDirectory() {
				return [];
			},
			async fileExists() {
				return false;
			}
		};
	}

	it('builds structured adapters for reusable local blocks without module loading', async () => {
		const backend = createBackend([
			`{
				"type": "block",
				"id": "gallery",
				"label": "Gallery",
				"blocks": [{ "id": "image", "type": "image" }]
			}`
		]);

		const registry = await loadBlockRegistry(backend);
		expect(registry.get('gallery')).toMatchObject({
			id: 'gallery',
			kind: 'local',
			path: 'tentman/blocks/block-1.tentman.json'
		});
		expect(
			registry.getAdapter('gallery')?.getDefaultValue({ id: 'gallery', type: 'gallery' })
		).toEqual({ image: '' });
	});

	it('loads package blocks after local blocks when blockPackages are configured', async () => {
		const backend = createBackend(
			[
				`{
					"type": "block",
					"id": "seo",
					"label": "SEO",
					"blocks": [{ "id": "metaTitle", "type": "text" }]
				}`
			],
			{
				blockPackages: ['@acme/tentman-blocks']
			}
		);

		const loadBlockPackageModule: NonNullable<LoadBlockRegistryOptions['loadBlockPackageModule']> =
			vi.fn().mockResolvedValue({
				blockPackage: {
					blocks: [
						{
							config: {
								type: 'block',
								id: 'heroBanner',
								label: 'Hero Banner',
								blocks: [
									{ id: 'title', type: 'text', required: true },
									{ id: 'seo', type: 'seo' }
								]
							}
						}
					]
				}
			});

		const registry = await loadBlockRegistry(backend, { loadBlockPackageModule });

		expect(loadBlockPackageModule).toHaveBeenCalledWith('@acme/tentman-blocks');
		expect(registry.get('heroBanner')).toMatchObject({
			id: 'heroBanner',
			kind: 'package',
			packageName: '@acme/tentman-blocks'
		});
		expect(
			registry.getAdapter('heroBanner')?.getDefaultValue({ id: 'hero', type: 'heroBanner' })
		).toEqual({
			title: '',
			seo: {
				metaTitle: ''
			}
		});
	});

	it('fails when blockPackages are configured without a package loader', async () => {
		const backend = createBackend([], {
			blockPackages: ['@acme/tentman-blocks']
		});

		await expect(loadBlockRegistry(backend)).rejects.toThrow(
			/blockPackages, but no block package module loader/
		);
	});

	it('fails when a block package does not export a named blockPackage object', async () => {
		const backend = createBackend([], {
			blockPackages: ['@acme/tentman-blocks']
		});

		await expect(
			loadBlockRegistry(backend, {
				loadBlockPackageModule: vi.fn().mockResolvedValue({})
			})
		).rejects.toThrow(/must export a named "blockPackage"/);
	});

	it('fails when a package block id duplicates a local block id', async () => {
		const backend = createBackend(
			[
				`{
					"type": "block",
					"id": "seo",
					"label": "SEO",
					"blocks": [{ "id": "metaTitle", "type": "text" }]
				}`
			],
			{
				blockPackages: ['@acme/tentman-blocks']
			}
		);

		await expect(
			loadBlockRegistry(backend, {
				loadBlockPackageModule: vi.fn().mockResolvedValue({
					blockPackage: {
						blocks: [
							{
								config: {
									type: 'block',
									id: 'seo',
									label: 'Package SEO',
									blocks: [{ id: 'description', type: 'text' }]
								}
							}
						]
					}
				})
			})
		).rejects.toThrow(/Duplicate block id "seo"/);
	});

	it('treats config.adapter as an unsupported key', async () => {
		const backend = createBackend([
			`{
				"type": "block",
				"id": "gallery",
				"label": "Gallery",
				"adapter": "./gallery.adapter.js",
				"blocks": [{ "id": "image", "type": "image" }]
			}`
		]);

		await expect(loadBlockRegistry(backend)).rejects.toThrow(/unsupported key: adapter/);
	});
});
