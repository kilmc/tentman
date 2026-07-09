import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import type { RootConfig } from '$lib/config/root-config';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';

interface BrowserAssetRenderingPageData {
	selectedBackend: SelectedBackend | null;
	selectedRepo: GitHubRepositoryIdentity | null;
	rootConfig: RootConfig | null;
}

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		}
	};
}

const assetRenderingMocks = vi.hoisted(() => ({
	resolveUrl: vi.fn(),
	readFile: vi.fn(),
	readLocalFile: vi.fn(),
	create: vi.fn(),
	delete: vi.fn(),
	getMetadata: vi.fn(),
	getMetadataForContent: vi.fn(),
	collectFromContent: vi.fn(),
	gc: vi.fn(),
	createObjectURL: vi.fn(),
	revokeObjectURL: vi.fn()
}));

const localContentState = vi.hoisted(() =>
	createStoreState<{ rootConfig: RootConfig | null }>({
		rootConfig: null
	})
);

const contentComponentLoaderMocks = vi.hoisted(() => ({
	loadContentComponentRegistryForMode: vi.fn()
}));

const pageData = vi.hoisted(
	(): BrowserAssetRenderingPageData => ({
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
		rootConfig: {
			assets: {
				path: './static/images/projects',
				publicPath: '/images/projects'
			}
		}
	})
);

const localPreviewUrlState = vi.hoisted(() => createStoreState<string | null>(null));
const localRepoState = vi.hoisted(() =>
	createStoreState({
		backend: null as {
			cacheKey: string;
			readFile(path: string): Promise<File>;
		} | null
	})
);

vi.mock('$app/state', () => ({
	page: {
		data: pageData
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

vi.mock('$lib/stores/local-preview-url', () => ({
	localPreviewUrl: {
		subscribe: localPreviewUrlState.subscribe
	}
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: localRepoState.subscribe
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
		assetRenderingMocks.readLocalFile.mockReset();
		assetRenderingMocks.create.mockReset();
		assetRenderingMocks.delete.mockReset();
		assetRenderingMocks.getMetadata.mockReset();
		assetRenderingMocks.getMetadataForContent.mockReset();
		assetRenderingMocks.collectFromContent.mockReset();
		assetRenderingMocks.gc.mockReset();
		assetRenderingMocks.createObjectURL.mockReset();
		assetRenderingMocks.revokeObjectURL.mockReset();
		assetRenderingMocks.resolveUrl.mockResolvedValue('data:image/png;base64,cmVuZGVyZWQ=');
		assetRenderingMocks.readLocalFile.mockResolvedValue(
			new File(['local-image'], 'hero.jpg', {
				type: 'image/jpeg',
				lastModified: 1
			})
		);
		assetRenderingMocks.createObjectURL.mockReturnValue('blob:local-hero');
		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			value: assetRenderingMocks.createObjectURL
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			configurable: true,
			value: assetRenderingMocks.revokeObjectURL
		});
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockReset();
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [],
			errors: [],
			getByName() {
				return undefined;
			}
		});
		pageData.selectedBackend = {
			kind: 'github',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			}
		};
		pageData.selectedRepo = {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'main'
		};
		pageData.rootConfig = {
			assets: {
				path: './static/images/projects',
				publicPath: '/images/projects'
			}
		};
		localContentState.set({
			rootConfig: null
		});
		localPreviewUrlState.set(null);
		localRepoState.set({ backend: null });
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

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute(
			'src',
			'data:image/png;base64,cmVuZGVyZWQ='
		);
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
			'/api/repo/asset?value=hero.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
		);
	});

	it('routes saved GitHub-backed public asset paths through the repo asset proxy', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'hero',
				type: 'image',
				label: 'Hero'
			},
			value: '/images/projects/hero.jpg',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute(
			'src',
			'/api/repo/asset?value=%2Fimages%2Fprojects%2Fhero.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
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

		await expect
			.poll(() => screen.container.querySelector('img')?.getAttribute('data-src') ?? null)
			.toBe(
				'/api/repo/asset?value=hero.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
			);
	});

	it('routes markdown audio and video HTML through the repo asset proxy', async () => {
		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body',
				assetsDir: 'static/images/posts'
			},
			value: [
				'<audio src="interview.mp3"></audio>',
				'<video poster="trailer-poster.jpg" src="/images/projects/trailer.mp4"></video>',
				'<video autoplay src="loop.mp4"></video>'
			].join('\n\n'),
			blockRegistry: new Map() as never
		});

		await expect
			.poll(() => screen.container.querySelector('audio')?.getAttribute('src') ?? null)
			.toBe(
				'/api/repo/asset?value=interview.mp3&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
			);

		await expect
			.poll(
				() =>
					screen.container.querySelectorAll('video')[0]?.getAttribute('src') ?? null
			)
			.toBe(
				'/api/repo/asset?value=%2Fimages%2Fprojects%2Ftrailer.mp4&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
			);

		const audio = screen.container.querySelector('audio');
		const video = screen.container.querySelectorAll('video')[0];
		const autoplayVideo = screen.container.querySelectorAll('video')[1];
		expect(video?.getAttribute('poster')).toBe(
			'/api/repo/asset?value=trailer-poster.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
		);
		expect(audio?.hasAttribute('controls')).toBe(true);
		expect(video?.hasAttribute('controls')).toBe(true);
		expect(autoplayVideo?.hasAttribute('controls')).toBe(false);
	});

	it('renders local image blocks from browser-backed object URLs', async () => {
		pageData.selectedBackend = {
			kind: 'local',
			repo: {
				name: 'Docs',
				pathLabel: '~/docs'
			}
		};
		pageData.selectedRepo = null;
		pageData.rootConfig = null;
		localContentState.set({
			rootConfig: {
				assets: {
					path: './static/images/projects',
					publicPath: '/images/projects'
				},
				local: {
					previewUrl: 'http://localhost:4173/'
				}
			}
		});
		localPreviewUrlState.set('http://localhost:5173/');
		localRepoState.set({
			backend: {
				cacheKey: 'local:~/docs',
				readFile: assetRenderingMocks.readLocalFile
			}
		});

		const screen = await render(ContentValueDisplay, {
			block: {
				id: 'hero',
				type: 'image',
				label: 'Hero'
			},
			value: 'hero.jpg',
			blockRegistry: new Map() as never
		});

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute(
			'src',
			'blob:local-hero'
		);
		expect(assetRenderingMocks.readLocalFile).toHaveBeenCalledWith('static/images/projects/hero.jpg');
		expect(assetRenderingMocks.createObjectURL).toHaveBeenCalledOnce();
	});

	it('renders discovered content component directives through fixed authoring chips', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
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

		await expect.poll(() => screen.container.textContent ?? '').toContain('Buy Button');
		await expect
			.poll(
				() =>
					screen.container.querySelector('[data-tentman-content-component-chip="inline"]')
						?.textContent ?? null
			)
			.toBe('Buy Button');
		const host = screen.container.querySelector('[data-tentman-content-component-chip="inline"]');
		expect(host).not.toBeNull();
	});

	it('renders the fixed authoring chip for discovered content component directives', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
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

		await expect.poll(() => screen.container.textContent ?? '').toContain('Buy Button');
		await expect
			.poll(
				() =>
					screen.container.querySelector('[data-tentman-content-component-chip="inline"]')
						?.textContent ?? null
			)
			.toBe('Buy Button');
		const host = screen.container.querySelector('[data-tentman-content-component-chip="inline"]');
		expect(host?.querySelector('a')).toBeNull();
		expect(host?.querySelector('img')).toBeNull();
	});

	it('renders plain chip text instead of component template markup in markdown fields', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
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

		await expect.poll(() => screen.container.textContent ?? '').toContain('Buy Button');
		await expect
			.poll(
				() =>
					screen.container.querySelector('[data-tentman-content-component-chip="inline"]')
						?.textContent ?? null
			)
			.toBe('Buy Button');
		const host = screen.container.querySelector('[data-tentman-content-component-chip="inline"]');
		expect(host).not.toBeNull();
		expect(host?.textContent).toContain('Buy Button');
		expect(screen.container.textContent).not.toContain('Buy button: Buy tickets');
	});

	it('surfaces content component errors without hiding the markdown', async () => {
		const buyButtonComponent = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			renderTemplateSource: '<a>{{ label }}</a>',
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
			screen.getByText(/Markdown content component handling failed for "buy-button"/)
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
			screen.getByText('Markdown field enables unknown content component "buy-button"')
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

		await expectElement(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute(
			'src',
			'data:image/png;base64,cmVuZGVyZWQ='
		);
		await expectElement(screen.getByText('Hello world')).toBeVisible();
	});
});
