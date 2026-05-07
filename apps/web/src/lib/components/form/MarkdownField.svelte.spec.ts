import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createMarkdownPluginExtensions } from '$lib/plugins/markdown';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import type { UnifiedLocalPlugin } from '$lib/plugins/types';
import type { Editor } from '@tiptap/core';

const draftAssetStoreMocks = vi.hoisted(() => ({
	create: vi.fn(),
	delete: vi.fn(),
	resolveUrl: vi.fn(),
	readFile: vi.fn(),
	getMetadata: vi.fn(),
	getMetadataForContent: vi.fn(),
	collectFromContent: vi.fn(),
	gc: vi.fn()
}));

function createStoreState<T>(initialValue: T) {
	const value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		}
	};
}

const localContentState = vi.hoisted(() =>
	createStoreState({
		status: 'ready',
		backendKey: 'local:test',
		configs: [],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		error: null
	})
);

const pluginLoaderMocks = vi.hoisted(() => ({
	loadMarkdownPluginsForMode: vi.fn()
}));

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
					full_name: 'acme/docs'
				}
			},
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			}
		}
	}
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		create: draftAssetStoreMocks.create,
		delete: draftAssetStoreMocks.delete,
		resolveUrl: draftAssetStoreMocks.resolveUrl,
		readFile: draftAssetStoreMocks.readFile,
		getMetadata: draftAssetStoreMocks.getMetadata,
		getMetadataForContent: draftAssetStoreMocks.getMetadataForContent,
		collectFromContent: draftAssetStoreMocks.collectFromContent,
		gc: draftAssetStoreMocks.gc
	}
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: localContentState.subscribe
	}
}));

vi.mock('$lib/plugins/browser', () => ({
	loadMarkdownPluginsForMode: pluginLoaderMocks.loadMarkdownPluginsForMode
}));

vi.mock('$lib/content-components/browser', () => ({
	loadContentComponentRegistryForMode: contentComponentLoaderMocks.loadContentComponentRegistryForMode
}));

import MarkdownField from './MarkdownField.svelte';

const modifierClickOptions = {
	modifiers: [navigator.platform.toLowerCase().includes('mac') ? 'Meta' : 'Control']
} as const;

function createBuyButtonPlugin() {
	const plugin: UnifiedLocalPlugin = {
		id: 'buy-button',
		version: '0.1.0',
		capabilities: ['markdown', 'preview'],
		markdown: {
			htmlInlineNodes: [
				{
					id: 'buy-button',
					nodeName: 'buyButton',
					selector: 'a[data-tentman-plugin="buy-button"]',
					attributes: [
						{
							name: 'href',
							default: '',
							parse(element: HTMLElement) {
								return element.getAttribute('href');
							}
						},
						{
							name: 'label',
							default: 'Buy online',
							parse(element: HTMLElement) {
								return element.getAttribute('data-label') ?? element.textContent;
							}
						},
						{
							name: 'variant',
							default: 'default',
							parse(element: HTMLElement) {
								return element.getAttribute('data-variant') ?? 'default';
							}
						}
					],
					renderHTML(attributes: Record<string, unknown>) {
						const label = String(attributes.label ?? 'Buy online');
						return {
							tag: 'a',
							attributes: {
								'data-tentman-plugin': 'buy-button',
								href: String(attributes.href ?? ''),
								'data-label': label,
								'data-variant': String(attributes.variant ?? 'default')
							},
							text: label
						};
					},
					editorView: {
						label(attributes: Record<string, unknown>) {
							return `Buy button: ${String(attributes.label ?? 'Buy online')}`;
						},
						className(attributes: Record<string, unknown>) {
							return String(attributes.variant ?? 'default') === 'secondary'
								? 'border-stone-400 bg-white text-stone-800'
								: 'border-emerald-600 bg-emerald-600 text-white';
						}
					},
					toolbarItems: [
						{
							id: 'buy-button',
							label: 'Buy Button',
							buttonLabel: 'Buy Button',
							isActive(editor: Editor) {
								return editor.isActive('buyButton');
							},
							dialog: {
								title: 'Buy button',
								submitLabel: 'Save button',
								fields: [
									{
										id: 'href',
										label: 'URL',
										type: 'url',
										required: true
									},
									{
										id: 'label',
										label: 'Label',
										type: 'text',
										defaultValue: 'Buy online',
										required: true
									},
									{
										id: 'variant',
										label: 'Variant',
										type: 'select',
										defaultValue: 'default',
										options: [
											{ label: 'Default', value: 'default' },
											{ label: 'Secondary', value: 'secondary' }
										]
									}
								],
								getInitialValues(editor: Editor) {
									const currentAttributes = editor.isActive('buyButton')
										? editor.getAttributes('buyButton')
										: {};

									return {
										href: String(currentAttributes.href ?? ''),
										label: String(currentAttributes.label ?? 'Buy online'),
										variant: String(currentAttributes.variant ?? 'default')
									};
								},
								validate(values: Record<string, string>) {
									return values.href.trim() ? null : 'A buy button needs a URL.';
								},
								submit(editor: Editor, values: Record<string, string>) {
									const attrs = {
										href: values.href.trim(),
										label: values.label.trim() || 'Buy online',
										variant: values.variant === 'secondary' ? 'secondary' : 'default'
									};

									if (editor.isActive('buyButton')) {
										editor.chain().focus().updateAttributes('buyButton', attrs).run();
										return;
									}

									editor
										.chain()
										.focus()
										.insertContent({
											type: 'buyButton',
											attrs
										})
										.run();
								}
							}
						}
					]
				}
			]
		}
	};

	return {
		plugin,
		result: {
			plugins: [{ id: 'buy-button', path: 'tentman/plugins/buy-button/plugin.js', plugin }],
			extensions: createMarkdownPluginExtensions([plugin]),
			toolbarItems: plugin.markdown?.htmlInlineNodes?.[0]?.toolbarItems ?? [],
			errors: []
		}
	};
}

function createDraftAssetResult(ref: string) {
	return {
		ref,
		previewUrl: `blob:${ref}`,
		metadata: {
			id: ref.slice('draft-asset:'.length),
			ref,
			repoKey: 'github:acme/docs',
			storagePath: 'static/images/posts/',
			originalName: 'hero.png',
			mimeType: 'image/png',
			size: 123,
			createdAt: '2026-04-09T10:00:00.000Z',
			targetFilename: 'hero-asset.png',
			targetPath: 'static/images/posts/hero-asset.png',
			publicPath: '/images/posts/hero-asset.png',
			byteStore: 'idb' as const,
			byteKey: 'hero'
		}
	};
}

function createBuyButtonContentComponentRegistry(): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/buy-button',
		componentJsonPath: 'src/lib/content-components/buy-button/component.json',
		renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
		previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
		renderTemplateSource:
			'<a class="buy-button buy-button--{{ variant }}" href="{{ href | escape }}">{{ label | escape }}</a>',
		previewTemplateSource:
			'<a class="tm-component-preview tm-component-preview--buy-button" href="{{ href | escape }}">Buy button: {{ label | escape }}</a>',
		definition: {
			id: 'buy-button',
			name: 'buy-button',
			kind: 'inline' as const,
			attributes: {
				href: {
					type: 'string' as const,
					required: true
				},
				label: {
					type: 'string' as const,
					required: true,
					default: 'Buy online',
					valueFromMarkdownLabel: true
				},
				variant: {
					type: 'enum' as const,
					default: 'default',
					options: ['default', 'secondary']
				}
			}
		}
	};

	return {
		components: [component],
		errors: [],
		getByName(name: string) {
			return name === component.definition.name ? component : undefined;
		}
	};
}

describe('components/form/MarkdownField.svelte', () => {
	beforeEach(() => {
		draftAssetStoreMocks.create.mockReset();
		draftAssetStoreMocks.delete.mockReset();
		draftAssetStoreMocks.resolveUrl.mockReset();
		draftAssetStoreMocks.readFile.mockReset();
		draftAssetStoreMocks.getMetadata.mockReset();
		draftAssetStoreMocks.getMetadataForContent.mockReset();
		draftAssetStoreMocks.collectFromContent.mockReset();
		draftAssetStoreMocks.gc.mockReset();
		pluginLoaderMocks.loadMarkdownPluginsForMode.mockReset();
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockReset();
		draftAssetStoreMocks.delete.mockResolvedValue(undefined);
		pluginLoaderMocks.loadMarkdownPluginsForMode.mockResolvedValue({
			plugins: [],
			extensions: [],
			toolbarItems: [],
			errors: []
		});
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue({
			components: [],
			errors: [],
			getByName() {
				return undefined;
			}
		});
	});

	it('initializes rich content from markdown and preserves content when switching tabs', async () => {
		draftAssetStoreMocks.resolveUrl.mockResolvedValue('blob:hero');

		const screen = render(MarkdownField, {
			label: 'Body',
			value: '# Hello world\n\n![Hero](draft-asset:hero)',
			storagePath: 'static/images/posts/',
			assetsDir: 'static/images/posts/'
		});

		await expect.element(screen.getByText('Hello world')).toBeVisible();
		await expect
			.element(screen.getByRole('img', { name: 'Hero' }))
			.toHaveAttribute('src', 'blob:hero');

		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expect
			.element(screen.getByLabelText('Body'))
			.toHaveValue('# Hello world\n\n![Hero](draft-asset:hero)');

		await screen.getByRole('button', { name: 'Rich' }).click();

		await expect.element(screen.getByText('Hello world')).toBeVisible();
		await expect
			.element(screen.getByRole('img', { name: 'Hero' }))
			.toHaveAttribute('src', 'blob:hero');
	});

	it('stages inline images from the toolbar, updates markdown, and cleans up removed refs', async () => {
		draftAssetStoreMocks.create.mockResolvedValue(createDraftAssetResult('draft-asset:uploaded'));

		const screen = render(MarkdownField, {
			label: 'Body',
			value: '',
			storagePath: 'static/images/posts/',
			assetsDir: 'static/images/posts/'
		});

		await screen
			.getByTestId('markdown-image-input')
			.upload(new File(['image-bytes'], 'hero.png', { type: 'image/png' }));

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expect
			.poll(() => (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? '')
			.toContain('draft-asset:uploaded');

		expect(draftAssetStoreMocks.create).toHaveBeenCalledWith(
			expect.any(File),
			expect.objectContaining({
				repoKey: 'github:acme/docs',
				storagePath: 'static/images/posts/'
			})
		);

		await screen.getByLabelText('Body').fill('');

		await expect.poll(() => draftAssetStoreMocks.delete.mock.calls.length).toBe(1);
		expect(draftAssetStoreMocks.delete).toHaveBeenCalledWith('draft-asset:uploaded');
	});

	it('keeps the length counter based on serialized markdown length', async () => {
		const screen = render(MarkdownField, {
			label: 'Body',
			value: '**hi**',
			maxLength: 8
		});

		await expect.element(screen.getByText('6/8')).toBeVisible();

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await screen.getByLabelText('Body').fill('**hello**!');

		await expect.element(screen.getByText('10/8')).toBeVisible();
	});

	it('updates toolbar pressed states when toolbar actions toggle formatting', async () => {
		const screen = render(MarkdownField, {
			label: 'Body',
			value: 'Hello world'
		});

		await expect.element(screen.getByText('Hello world')).toBeVisible();

		const richEditor = document.querySelector('.ProseMirror');
		if (!(richEditor instanceof HTMLElement)) {
			throw new Error('Expected rich editor to mount');
		}

		const paragraph = richEditor.querySelector('p');
		if (!(paragraph instanceof HTMLElement)) {
			throw new Error('Expected editor paragraph to render');
		}

		richEditor.focus();

		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(paragraph);
		selection?.removeAllRanges();
		selection?.addRange(range);

		await screen.getByRole('button', { name: 'Bold' }).click();

		await expect
			.element(screen.getByRole('button', { name: 'Bold' }))
			.toHaveAttribute('aria-pressed', 'true');

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expect.element(screen.getByLabelText('Body')).toHaveValue('**Hello world**');
	});

	it('shows a link popover and updates existing links without using a browser prompt', async () => {
		const promptSpy = vi.spyOn(window, 'prompt');

		const screen = render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/old)'
		});

		await screen.getByText('Example').click();
		await expect
			.element(screen.getByRole('textbox', { name: 'URL' }))
			.toHaveValue('https://example.com/old');

		await screen.getByRole('textbox', { name: 'URL' }).fill('https://example.com/new');
		await screen.getByRole('button', { name: 'Save link' }).click();
		await expect.poll(() => document.querySelector('[aria-label="Link actions"]')).toBeNull();
		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expect
			.element(screen.getByLabelText('Body'))
			.toHaveValue('[Example](https://example.com/new)');
		expect(promptSpy).not.toHaveBeenCalled();
	});

	it('closes the link editor when cancel is pressed', async () => {
		const screen = render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/old)'
		});

		await screen.getByText('Example').click();
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.poll(() => document.querySelector('[aria-label="Link actions"]')).toBeNull();
	});

	it('reopens the link editor on the same selection after cancel', async () => {
		const screen = render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/old)'
		});

		await screen.getByText('Example').click();
		await screen.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => document.querySelector('[aria-label="Link actions"]')).toBeNull();

		await screen.getByRole('button', { name: 'Link' }).click();
		await expect
			.element(screen.getByRole('textbox', { name: 'URL' }))
			.toHaveValue('https://example.com/old');
	});

	it('opens native links on modifier click', async () => {
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const screen = render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/open)'
		});

		await screen.getByText('Example').click(modifierClickOptions);
		expect(openSpy).toHaveBeenCalledWith('https://example.com/open', '_blank', 'noopener');
	});

	it('lists discovered content components and inserts semantic markdown markers', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ''
		});

		await screen.getByRole('button', { name: 'Buy Button' }).click();
		await expect.element(screen.getByText('Insert Buy Button')).toBeVisible();
		await screen.getByLabelText('URL *').fill('https://example.com/buy');
		await expect
			.element(
				screen.getByText(
					':buy-button[Buy online]{href="https://example.com/buy" variant="default"}'
				)
			)
			.toBeVisible();
		await screen.getByLabelText('Label *').fill('Buy tickets');
		await expect
			.element(
				screen.getByText(
					':buy-button[Buy tickets]{href="https://example.com/buy" variant="default"}'
				)
			)
			.toBeVisible();

		const variantSelect = document.querySelector('select');
		if (!(variantSelect instanceof HTMLSelectElement)) {
			throw new Error('Expected buy button variant select');
		}
		variantSelect.value = 'secondary';
		variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
		await expect
			.element(
				screen.getByText(
					':buy-button[Buy tickets]{href="https://example.com/buy" variant="secondary"}'
				)
			)
			.toBeVisible();

		await screen.getByRole('button', { name: 'Save buy button' }).click();
		await expect.element(screen.getByText('Buy button: Buy tickets')).toBeVisible();

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expect
			.element(screen.getByLabelText('Body'))
			.toHaveValue(':buy-button[Buy tickets]{href="https://example.com/buy" variant="secondary"}');
	});

	it('shows live validation state for content component dialogs before submit', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ''
		});

		await screen.getByRole('button', { name: 'Buy Button' }).click();
		await expect.element(screen.getByText('URL is required.')).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Save buy button' }))
			.toBeDisabled();

		await screen.getByLabelText('URL *').fill('https://example.com/buy');
		await expect.poll(() => document.querySelector('[role="alert"]')?.textContent ?? null).toBeNull();
		await expect
			.element(screen.getByRole('button', { name: 'Save buy button' }))
			.toBeEnabled();
	});

	it('focuses and dismisses content component dialogs from the keyboard', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ''
		});

		await screen.getByRole('button', { name: 'Buy Button' }).click();

		const urlInput = screen.getByLabelText('URL *');
		await expect.poll(() => document.activeElement === urlInput.element()).toBe(true);
		expect(document.body.style.overflow).toBe('hidden');

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
		await expect.poll(() => document.body.style.overflow).toBe('');
		await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toBe('Buy Button');
	});

	it('parses existing content component markers back into editable values', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Old label]{href="https://example.com/old" variant="default"}'
		});

		await screen.getByText('Buy button: Old label').click();
		await screen.getByRole('button', { name: 'Edit buy button' }).click();
		await expect.element(screen.getByText('Edit Buy Button')).toBeVisible();

		await expect.element(screen.getByLabelText('URL *')).toHaveValue('https://example.com/old');
		await expect.element(screen.getByLabelText('Label *')).toHaveValue('Old label');

		await screen.getByLabelText('URL *').fill('https://example.com/new');
		await screen.getByLabelText('Label *').fill('New label');
		await screen.getByRole('button', { name: 'Save buy button' }).click();

		await expect.element(screen.getByText('Buy button: New label')).toBeVisible();
		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expect
			.element(screen.getByLabelText('Body'))
			.toHaveValue(':buy-button[New label]{href="https://example.com/new" variant="default"}');
	});

	it('re-renders content component previews after edits and opens the editor from the popover', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Buy now]{href="https://example.com/shop" variant="default"}'
		});

		await screen.getByText('Buy button: Buy now').click();
		await expect.element(screen.getByText('https://example.com/shop')).toBeVisible();

		await screen.getByRole('button', { name: 'Edit buy button' }).click();
		await expect.element(screen.getByLabelText('URL *')).toHaveValue('https://example.com/shop');
		await expect.element(screen.getByLabelText('Label *')).toHaveValue('Buy now');

		await screen.getByLabelText('Label *').fill('Buy later');
		await screen.getByRole('button', { name: 'Save buy button' }).click();
		await expect.element(screen.getByText('Buy button: Buy later')).toBeVisible();
	});

	it('opens content component links on modifier click', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const screen = render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Buy now]{href="https://example.com/shop" variant="default"}'
		});

		await screen.getByText('Buy button: Buy now').click(modifierClickOptions);
		expect(openSpy).toHaveBeenCalledWith('https://example.com/shop', '_blank', 'noopener');
	});
});
