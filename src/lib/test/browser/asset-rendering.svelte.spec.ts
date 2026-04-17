import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		}
	};
}

const assetRenderingMocks = vi.hoisted(() => ({
	resolveUrl: vi.fn(),
	readFile: vi.fn(),
	create: vi.fn(),
	delete: vi.fn(),
	getMetadata: vi.fn(),
	getMetadataForContent: vi.fn(),
	collectFromContent: vi.fn(),
	gc: vi.fn()
}));

const localContentState = vi.hoisted(() =>
	createStoreState({
		rootConfig: null
	})
);

const pluginLoaderMocks = vi.hoisted(() => ({
	loadPluginRegistryForMode: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: {
		data: {
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			},
			rootConfig: null
		}
	}
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		resolveUrl: assetRenderingMocks.resolveUrl,
		readFile: assetRenderingMocks.readFile,
		create: assetRenderingMocks.create,
		delete: assetRenderingMocks.delete,
		getMetadata: assetRenderingMocks.getMetadata,
		getMetadataForContent: assetRenderingMocks.getMetadataForContent,
		collectFromContent: assetRenderingMocks.collectFromContent,
		gc: assetRenderingMocks.gc
	}
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: localContentState.subscribe
	}
}));

vi.mock('$lib/plugins/browser', () => ({
	loadPluginRegistryForMode: pluginLoaderMocks.loadPluginRegistryForMode
}));

import ItemCard from '$lib/components/ItemCard.svelte';
import ContentValueDisplay from '$lib/components/content/ContentValueDisplay.svelte';

describe('shared draft asset rendering surfaces', () => {
	beforeEach(() => {
		assetRenderingMocks.resolveUrl.mockReset();
		assetRenderingMocks.readFile.mockReset();
		assetRenderingMocks.create.mockReset();
		assetRenderingMocks.delete.mockReset();
		assetRenderingMocks.getMetadata.mockReset();
		assetRenderingMocks.getMetadataForContent.mockReset();
		assetRenderingMocks.collectFromContent.mockReset();
		assetRenderingMocks.gc.mockReset();
		assetRenderingMocks.resolveUrl.mockResolvedValue('data:image/png;base64,cmVuZGVyZWQ=');
		pluginLoaderMocks.loadPluginRegistryForMode.mockReset();
		pluginLoaderMocks.loadPluginRegistryForMode.mockResolvedValue({
			plugins: [],
			errors: [],
			get() {
				return undefined;
			}
		});
	});

	it('renders staged draft refs in content display image blocks', async () => {
		const screen = render(ContentValueDisplay, {
			block: {
				id: 'hero',
				type: 'image',
				label: 'Hero',
				assetsDir: 'static/images'
			},
			value: 'draft-asset:hero',
			blockRegistry: new Map() as never
		});

		await expect.element(screen.getByRole('img', { name: 'Hero' })).toBeVisible();
		await expect.element(screen.getByText('draft-asset:hero')).toBeVisible();
	});

	it('renders markdown blocks as formatted content instead of raw markdown text', async () => {
		const screen = render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body'
			},
			value: '# Hello world\n\nThis is **bold** text.',
			blockRegistry: new Map() as never
		});

		await expect.element(screen.getByRole('heading', { name: 'Hello world' })).toBeVisible();
		await expect.element(screen.getByText('bold')).toBeVisible();
		await expect.element(screen.getByText('This is')).toBeVisible();
	});

	it('renders buy-button markers as button-like links in markdown preview', async () => {
		const loadedPlugin = {
			id: 'buy-button',
			path: 'tentman/plugins/buy-button/plugin.js',
			plugin: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['preview'],
				preview: {
					transformMarkdown(markdown: string) {
						return markdown.replace(
							'data-tentman-plugin="buy-button"',
							'class="tentman-preview-buy-button" data-tentman-plugin="buy-button"'
						);
					}
				}
			}
		};
		pluginLoaderMocks.loadPluginRegistryForMode.mockResolvedValue({
			plugins: [loadedPlugin],
			errors: [],
			get(id: string) {
				return id === 'buy-button' ? loadedPlugin : undefined;
			}
		});

		const screen = render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				plugins: ['buy-button']
			},
			value: '<a data-tentman-plugin="buy-button" href="https://example.com">Buy online</a>',
			blockRegistry: new Map() as never
		});

		await expect
			.element(screen.getByRole('link', { name: 'Buy online' }))
			.toHaveClass('tentman-preview-buy-button');
	});

	it('surfaces missing markdown preview plugin errors without hiding the markdown', async () => {
		const screen = render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				plugins: ['buy-button']
			},
			value: '**Buy online**',
			blockRegistry: new Map() as never
		});

		await expect.element(screen.getByText('Buy online')).toBeVisible();
		await expect
			.element(
				screen.getByText(
					'Markdown preview enables plugin "buy-button", but it is not registered in root.plugins'
				)
			)
			.toBeVisible();
	});

	it('surfaces transform failures while preserving the original markdown preview', async () => {
		const loadedPlugin = {
			id: 'buy-button',
			path: 'tentman/plugins/buy-button/plugin.js',
			plugin: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['preview'],
				preview: {
					transformMarkdown() {
						throw new Error('Buy button preview failed');
					}
				}
			}
		};
		pluginLoaderMocks.loadPluginRegistryForMode.mockResolvedValue({
			plugins: [loadedPlugin],
			errors: [],
			get(id: string) {
				return id === 'buy-button' ? loadedPlugin : undefined;
			}
		});

		const screen = render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				plugins: ['buy-button']
			},
			value: '**Buy online**',
			blockRegistry: new Map() as never
		});

		await expect.element(screen.getByText('Buy online')).toBeVisible();
		await expect.element(screen.getByText('Buy button preview failed')).toBeVisible();
	});

	it('shares preview plugin registry loading across nested markdown children', async () => {
		const loadedPlugin = {
			id: 'buy-button',
			path: 'tentman/plugins/buy-button/plugin.js',
			plugin: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['preview'],
				preview: {
					transformMarkdown(markdown: string) {
						return markdown.replaceAll(
							'data-tentman-plugin="buy-button"',
							'class="tentman-preview-buy-button" data-tentman-plugin="buy-button"'
						);
					}
				}
			}
		};
		pluginLoaderMocks.loadPluginRegistryForMode.mockResolvedValue({
			plugins: [loadedPlugin],
			errors: [],
			get(id: string) {
				return id === 'buy-button' ? loadedPlugin : undefined;
			}
		});

		const screen = render(ContentValueDisplay, {
			block: {
				id: 'product',
				type: 'block',
				label: 'Product',
				blocks: [
					{
						id: 'intro',
						type: 'markdown',
						label: 'Intro',
						plugins: ['buy-button']
					},
					{
						id: 'details',
						type: 'markdown',
						label: 'Details',
						plugins: ['buy-button']
					}
				]
			},
			value: {
				intro:
					'<a data-tentman-plugin="buy-button" href="https://example.com/intro">Intro button</a>',
				details:
					'<a data-tentman-plugin="buy-button" href="https://example.com/details">Details button</a>'
			},
			blockRegistry: new Map() as never
		});

		await expect
			.element(screen.getByRole('link', { name: 'Intro button' }))
			.toHaveClass('tentman-preview-buy-button');
		await expect
			.element(screen.getByRole('link', { name: 'Details button' }))
			.toHaveClass('tentman-preview-buy-button');
		expect(pluginLoaderMocks.loadPluginRegistryForMode).toHaveBeenCalledTimes(1);
	});

	it('renders staged draft refs in item cards', async () => {
		const screen = render(ItemCard, {
			item: {
				title: 'Hello world',
				hero: 'draft-asset:hero'
			},
			href: '/pages/posts/hello-world',
			cardFields: {
				primary: [
					{
						id: 'title',
						type: 'text',
						label: 'Title'
					}
				],
				secondary: [
					{
						id: 'hero',
						type: 'image',
						label: 'Hero',
						assetsDir: 'static/images'
					}
				]
			}
		});

		await expect.element(screen.getByRole('img', { name: 'Hero' })).toBeVisible();
		await expect.element(screen.getByText('Hello world')).toBeVisible();
	});
});
