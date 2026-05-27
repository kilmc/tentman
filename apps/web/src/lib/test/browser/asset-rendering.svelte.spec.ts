import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';

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

const contentComponentLoaderMocks = vi.hoisted(() => ({
	loadContentComponentRegistryForMode: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: {
		data: {
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'main'
				}
			},
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
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

vi.mock('$lib/content-components/browser', () => ({
	loadContentComponentRegistryForMode:
		contentComponentLoaderMocks.loadContentComponentRegistryForMode
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
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockReset();
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [],
			errors: [],
			getByName() {
				return undefined;
			}
		});
	});

	it('renders staged draft refs in content display image blocks', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'hero',
				type: 'image',
				label: 'Hero',
				assetsDir: 'static/images'
			},
			value: 'draft-asset:hero',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toBeVisible();
		await expectElement(screen.getByText('draft-asset:hero')).toBeVisible();
	});

	it('renders markdown blocks as formatted content instead of raw markdown text', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body'
			},
			value: '# Hello world\n\nThis is **bold** text.',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByRole('heading', { name: 'Hello world' })).toBeVisible();
		await expectElement(screen.getByText('bold')).toBeVisible();
		await expectElement(screen.getByText('This is')).toBeVisible();
	});

	it('routes saved GitHub-backed image blocks through the repo asset proxy', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'hero',
				type: 'image',
				label: 'Hero',
				assetsDir: 'static/images/posts'
			},
			value: 'hero.jpg',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute(
			'src',
			'/api/repo/asset?value=hero.jpg&assetsDir=static%2Fimages%2Fposts&owner=acme&repo=docs&branch=main'
		);
	});

	it('routes markdown image embeds through the repo asset proxy', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				assetsDir: 'static/images/posts'
			},
			value: '![Hero](hero.jpg)',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute(
			'src',
			'/api/repo/asset?value=hero.jpg&assetsDir=static%2Fimages%2Fposts&owner=acme&repo=docs&branch=main'
		);
	});

	it('renders discovered content component directives through preview.njk markup', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
			previewTemplateSource:
				'<span class="tm-component-preview tm-component-preview--buy-button">Buy button: {{ label | escape }}</span>',
			definition: {
				id: 'buy-button',
				name: 'buy-button',
				kind: 'inline',
				attributes: {
					href: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: false
					},
					label: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: true
					}
				}
			}
		};
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [buyButtonComponent],
			errors: [],
			getByName(name: string) {
				return name === 'buy-button' ? buyButtonComponent : undefined;
			}
		});

		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				components: ['buy-button']
			},
			value: ':buy-button[Buy tickets]{href="/tickets"}',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByText('Buy button: Buy tickets')).toBeVisible();
		const host = screen.container.querySelector('[data-tentman-safe-preview-host="inline"]');
		expect(host).not.toBeNull();
		expect(host?.shadowRoot?.textContent).toContain('Buy button: Buy tickets');
	});

	it('renders hostile preview html inside a shadow host after sanitization', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
			previewTemplateSource:
				'<a href="{{ href | escape }}" onclick="alert(1)"><span class="safe">Buy button: {{ label | escape }}</span></a><img src="javascript:alert(1)" alt="Bad">',
			definition: {
				id: 'buy-button',
				name: 'buy-button',
				kind: 'inline',
				attributes: {
					href: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: false
					},
					label: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: true
					}
				}
			}
		};
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [buyButtonComponent],
			errors: [],
			getByName(name: string) {
				return name === 'buy-button' ? buyButtonComponent : undefined;
			}
		});

		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				components: ['buy-button']
			},
			value: ':buy-button[Buy tickets]{href="/tickets"}',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByText('Buy button: Buy tickets')).toBeVisible();
		const host = screen.container.querySelector('[data-tentman-safe-preview-host="inline"]');
		expect(host?.shadowRoot?.querySelector('a')).toBeNull();
		expect(host?.shadowRoot?.querySelector('img')?.getAttribute('src')).toBeNull();
		expect(host?.shadowRoot?.textContent).toContain('Buy button: Buy tickets');
	});

	it('applies safe preview css inside the shadow host only', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
			previewCssPath: 'src/lib/content-components/buy-button/preview.css',
			renderTemplateSource: '<a>{{ label }}</a>',
			previewTemplateSource:
				'<span class="safe buy-button-preview">Buy button: {{ label | escape }}</span>',
			previewCssSource:
				'.buy-button-preview { color: rgb(255, 0, 0); z-index: 20; } body { color: rgb(0, 0, 255); }',
			definition: {
				id: 'buy-button',
				name: 'buy-button',
				kind: 'inline',
				attributes: {
					href: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: false
					},
					label: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: true
					}
				}
			}
		};
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [buyButtonComponent],
			errors: [],
			getByName(name: string) {
				return name === 'buy-button' ? buyButtonComponent : undefined;
			}
		});

		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				components: ['buy-button']
			},
			value: ':buy-button[Buy tickets]{href="/tickets"}',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByText('Buy button: Buy tickets')).toBeVisible();
		const host = screen.container.querySelector('[data-tentman-safe-preview-host="inline"]');
		const preview = host?.shadowRoot?.querySelector('.buy-button-preview');
		expect(preview).not.toBeNull();
		expect(host?.shadowRoot?.querySelector('style:last-of-type')?.textContent).not.toContain(
			'z-index'
		);
		expect(getComputedStyle(preview as Element).color).toBe('rgb(255, 0, 0)');
		expect(getComputedStyle(document.body).color).not.toBe('rgb(0, 0, 255)');
	});

	it('surfaces content component preview errors without hiding the markdown', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
			previewTemplateSource:
				'<span class="tm-component-preview tm-component-preview--buy-button">Buy button: {{ label | escape }}</span>',
			definition: {
				id: 'buy-button',
				name: 'buy-button',
				kind: 'inline',
				attributes: {
					href: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: false
					},
					label: {
						type: 'string',
						required: true,
						valueFromMarkdownLabel: true
					}
				}
			}
		};
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [buyButtonComponent],
			errors: [],
			getByName(name: string) {
				return name === 'buy-button' ? buyButtonComponent : undefined;
			}
		});

		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				components: ['buy-button']
			},
			value: ':buy-button[Buy tickets]',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByText(':buy-button[Buy tickets]')).toBeVisible();
		await expectElement(
			screen.getByText(/Markdown preview failed for content component "buy-button"/)
		).toBeVisible();
	});

	it('surfaces missing markdown content component errors without hiding the markdown', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				components: ['buy-button']
			},
			value: '**Buy online**',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByText('Buy online')).toBeVisible();
		await expectElement(
			screen.getByText('Markdown preview enables unknown content component "buy-button"')
		).toBeVisible();
	});

	it('renders staged draft refs in item cards', async () => {
		const screen = await render(ItemCard, {
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

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toBeVisible();
		await expectElement(screen.getByText('Hello world')).toBeVisible();
	});
});
