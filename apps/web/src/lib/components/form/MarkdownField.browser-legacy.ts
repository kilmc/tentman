// Legacy Vitest Browser Mode spec retained for reference only.
// Stable browser coverage now lives in tests/playwright/markdown-field.spec.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import FormGeneratorSubmitHarness from '$lib/test/fixtures/FormGeneratorSubmitHarness.svelte';

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

vi.mock('$lib/content-components/browser', () => ({
	loadContentComponentRegistryForMode:
		contentComponentLoaderMocks.loadContentComponentRegistryForMode
}));

import MarkdownField from './MarkdownField.svelte';

const modifierClickOptions = {
	modifiers: [navigator.platform.toLowerCase().includes('mac') ? 'Meta' : 'Control']
} as const;

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

function createProjectGalleryContentComponentRegistry(): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/project-gallery',
		componentJsonPath: 'src/lib/content-components/project-gallery/component.json',
		renderTemplatePath: 'src/lib/content-components/project-gallery/render.njk',
		previewTemplatePath: 'src/lib/content-components/project-gallery/preview.njk',
		renderTemplateSource: '<div>Gallery</div>',
		previewTemplateSource:
			'<div class="tm-component-preview tm-component-preview--project-gallery">{% if data %}Project gallery: {{ data.title | escape }}{% else %}Missing gallery reference{% endif %}</div>',
		definition: {
			id: 'project-gallery',
			name: 'project-gallery',
			kind: 'block' as const,
			attributes: {
				galleryId: {
					type: 'string' as const,
					required: true,
					reference: true,
					referenceScope: {
						preview: 'container' as const,
						render: 'container' as const
					},
					editor: {
						label: 'Gallery'
					}
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
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockReset();
		draftAssetStoreMocks.delete.mockResolvedValue(undefined);
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

		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '# Hello world\n\n![Hero](draft-asset:hero)',
			storagePath: 'static/images/posts/',
			assetsDir: 'static/images/posts/'
		});

		await expectElement(screen.getByText('Hello world')).toBeVisible();
		await expectElement(screen.getByRole('img', { name: 'Hero' }))
			.toHaveAttribute('src', 'blob:hero');

		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expectElement(screen.getByLabelText('Body'))
			.toHaveValue('# Hello world\n\n![Hero](draft-asset:hero)');

		await screen.getByRole('button', { name: 'Rich' }).click();

		await expectElement(screen.getByText('Hello world')).toBeVisible();
		await expectElement(screen.getByRole('img', { name: 'Hero' }))
			.toHaveAttribute('src', 'blob:hero');
	});

	it('stages inline images from the toolbar, updates markdown, and cleans up removed refs', async () => {
		draftAssetStoreMocks.create.mockResolvedValue(createDraftAssetResult('draft-asset:uploaded'));

		const screen = await render(MarkdownField, {
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
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '**hi**',
			maxLength: 8
		});

		await expectElement(screen.getByText('6/8')).toBeVisible();

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await screen.getByLabelText('Body').fill('**hello**!');

		await expectElement(screen.getByText('10/8')).toBeVisible();
	});

	it('updates toolbar pressed states when toolbar actions toggle formatting', async () => {
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: 'Hello world'
		});

		await expectElement(screen.getByText('Hello world')).toBeVisible();

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

		await expectElement(screen.getByRole('button', { name: 'Bold' }))
			.toHaveAttribute('aria-pressed', 'true');

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expectElement(screen.getByLabelText('Body')).toHaveValue('**Hello world**');
	});

	it('shows a link popover and updates existing links without using a browser prompt', async () => {
		const promptSpy = vi.spyOn(window, 'prompt');

		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/old)'
		});

		await screen.getByText('Example').click();
		await expectElement(screen.getByRole('textbox', { name: 'URL' }))
			.toHaveValue('https://example.com/old');

		await screen.getByRole('textbox', { name: 'URL' }).fill('https://example.com/new');
		await screen.getByRole('button', { name: 'Save link' }).click();
		await expect.poll(() => document.querySelector('[aria-label="Link actions"]')).toBeNull();
		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expectElement(screen.getByLabelText('Body'))
			.toHaveValue('[Example](https://example.com/new)');
		expect(promptSpy).not.toHaveBeenCalled();
	});

	it('closes the link editor when cancel is pressed', async () => {
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/old)'
		});

		await screen.getByText('Example').click();
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.poll(() => document.querySelector('[aria-label="Link actions"]')).toBeNull();
	});

	it('reopens the link editor on the same selection after cancel', async () => {
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '[Example](https://example.com/old)'
		});

		await screen.getByText('Example').click();
		await screen.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => document.querySelector('[aria-label="Link actions"]')).toBeNull();

		await screen.getByRole('button', { name: 'Link' }).click();
		await expectElement(screen.getByRole('textbox', { name: 'URL' }))
			.toHaveValue('https://example.com/old');
	});

	it('opens native links on modifier click', async () => {
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const screen = await render(MarkdownField, {
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

		const screen = await render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ''
		});

		await screen.getByRole('button', { name: 'Buy Button' }).click();
		await expectElement(screen.getByText('Insert Buy Button')).toBeVisible();
		await screen.getByLabelText('URL *').fill('https://example.com/buy');
		await expectElement(
				screen.getByText(
					':buy-button[Buy online]{href="https://example.com/buy" variant="default"}'
				)
			)
			.toBeVisible();
		await screen.getByLabelText('Label *').fill('Buy tickets');
		await expectElement(
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
		await expectElement(
				screen.getByText(
					':buy-button[Buy tickets]{href="https://example.com/buy" variant="secondary"}'
				)
			)
			.toBeVisible();

		await screen.getByRole('button', { name: 'Save buy button' }).click();
		await expectElement(screen.getByText('Buy button: Buy tickets')).toBeVisible();

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expectElement(screen.getByLabelText('Body'))
			.toHaveValue(':buy-button[Buy tickets]{href="https://example.com/buy" variant="secondary"}');
	});

	it('shows live validation state for content component dialogs before submit', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = await render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ''
		});

		await screen.getByRole('button', { name: 'Buy Button' }).click();
		await expectElement(screen.getByText('URL is required.')).toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Save buy button' })).toBeDisabled();

		await screen.getByLabelText('URL *').fill('https://example.com/buy');
		await expect
			.poll(() => document.querySelector('[role="alert"]')?.textContent ?? null)
			.toBeNull();
		await expectElement(screen.getByRole('button', { name: 'Save buy button' })).toBeEnabled();
	});

	it('focuses and dismisses content component dialogs from the keyboard', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = await render(MarkdownField, {
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

		const screen = await render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Old label]{href="https://example.com/old" variant="default"}'
		});

		await screen.getByText('Buy button: Old label').click();
		await screen.getByRole('button', { name: 'Edit buy button' }).click();
		await expectElement(screen.getByText('Edit Buy Button')).toBeVisible();

		await expectElement(screen.getByLabelText('URL *')).toHaveValue('https://example.com/old');
		await expectElement(screen.getByLabelText('Label *')).toHaveValue('Old label');

		await screen.getByLabelText('URL *').fill('https://example.com/new');
		await screen.getByLabelText('Label *').fill('New label');
		await screen.getByRole('button', { name: 'Save buy button' }).click();

		await expectElement(screen.getByText('Buy button: New label')).toBeVisible();
		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expectElement(screen.getByLabelText('Body'))
			.toHaveValue(':buy-button[New label]{href="https://example.com/new" variant="default"}');
	});

	it('keeps incomplete component markers visible and reopens them with recovered values', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = await render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Old label]{href="https://example.com/old"'
		});

		await expectElement(screen.getByText(/Could not parse directive attributes/i)).toBeVisible();

		await screen.getByText(/Could not parse directive attributes/i).click();
		await expectElement(screen.getByText('Edit Buy Button')).toBeVisible();
		await expectElement(screen.getByLabelText('URL *')).toHaveValue('https://example.com/old');
		await expectElement(screen.getByLabelText('Label *')).toHaveValue('Old label');

		const variantSelect = document.querySelector('select');
		if (!(variantSelect instanceof HTMLSelectElement)) {
			throw new Error('Expected buy button variant select');
		}
		variantSelect.value = 'secondary';
		variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
		await screen.getByRole('button', { name: 'Save buy button' }).click();

		await expectElement(screen.getByText('Buy button: Old label')).toBeVisible();
		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expectElement(screen.getByLabelText('Body'))
			.toHaveValue(':buy-button[Old label]{href="https://example.com/old" variant="secondary"}');
	});

	it('re-renders content component previews after edits and opens the editor from the popover', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = await render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Buy now]{href="https://example.com/shop" variant="default"}'
		});

		await screen.getByText('Buy button: Buy now').click();
		await expectElement(screen.getByText('https://example.com/shop')).toBeVisible();

		await screen.getByRole('button', { name: 'Edit buy button' }).click();
		await expectElement(screen.getByLabelText('URL *')).toHaveValue('https://example.com/shop');
		await expectElement(screen.getByLabelText('Label *')).toHaveValue('Buy now');

		await screen.getByLabelText('Label *').fill('Buy later');
		await screen.getByRole('button', { name: 'Save buy button' }).click();
		await expectElement(screen.getByText('Buy button: Buy later')).toBeVisible();
	});

	it('opens content component links on modifier click', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const screen = await render(MarkdownField, {
			fieldId: 'body',
			label: 'Body',
			value: ':buy-button[Buy now]{href="https://example.com/shop" variant="default"}'
		});

		await screen.getByText('Buy button: Buy now').click(modifierClickOptions);
		expect(openSpy).toHaveBeenCalledWith('https://example.com/shop', '_blank', 'noopener');
	});

	it('opens the edit dialog directly for non-link content components', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createProjectGalleryContentComponentRegistry()
		);

		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'body',
						type: 'markdown',
						label: 'Body',
						components: ['project-gallery']
					},
					{
						id: 'galleries',
						type: 'block',
						label: 'Galleries',
						collection: true,
						itemLabel: 'Gallery',
						blocks: [
							{
								id: 'id',
								type: 'text',
								label: 'Gallery ID',
								referenceFor: 'project-gallery:galleryId'
							},
							{
								id: 'title',
								type: 'text',
								label: 'Title',
								referenceLabel: true
							}
						]
					}
				]
			},
			initialData: {
				body: '::project-gallery{galleryId="city-sketches"}',
				galleries: [
					{
						id: 'city-sketches',
						title: 'City sketches'
					}
				]
			}
		});

		await screen.getByText('Project gallery: City sketches').click();
		await expectElement(screen.getByText('Edit Project Gallery')).toBeVisible();
	});

	it('shows reference attribute options from the current content item', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createProjectGalleryContentComponentRegistry()
		);

		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'body',
						type: 'markdown',
						label: 'Body',
						components: ['project-gallery']
					},
					{
						id: 'galleries',
						type: 'block',
						label: 'Galleries',
						collection: true,
						itemLabel: 'Gallery',
						blocks: [
							{
								id: 'id',
								type: 'text',
								label: 'Gallery ID',
								referenceFor: 'project-gallery:galleryId'
							},
							{
								id: 'title',
								type: 'text',
								label: 'Title',
								referenceLabel: true
							}
						]
					}
				]
			},
			initialData: {
				body: '',
				galleries: [
					{
						id: 'city-sketches',
						title: 'City sketches'
					},
					{
						id: 'paper-notes',
						title: 'Paper notes'
					}
				]
			}
		});

		await screen.getByRole('button', { name: 'Project Gallery' }).click();
		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected gallery reference select');
		}

		const options = Array.from(select.options).map((option) => ({
			label: option.label,
			value: option.value
		}));
		expect(options).toEqual([
			{ label: 'Select gallery', value: '' },
			{ label: 'City sketches', value: 'city-sketches' },
			{ label: 'Paper notes', value: 'paper-notes' }
		]);
	});

	it('blocks submit while markdown contains an unresolved referenced component', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createProjectGalleryContentComponentRegistry()
		);

		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'body',
						type: 'markdown',
						label: 'Body',
						components: ['project-gallery']
					},
					{
						id: 'galleries',
						type: 'block',
						label: 'Galleries',
						collection: true,
						itemLabel: 'Gallery',
						blocks: [
							{
								id: 'id',
								type: 'text',
								label: 'Gallery ID',
								referenceFor: 'project-gallery:galleryId'
							},
							{
								id: 'title',
								type: 'text',
								label: 'Title',
								referenceLabel: true
							}
						]
					}
				]
			},
			initialData: {
				body: '::project-gallery{galleryId="missing-gallery"}',
				galleries: [
					{
						id: 'city-sketches',
						title: 'City sketches'
					}
				]
			}
		});

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('submit-error'))
			.toHaveTextContent(/could not resolve token "missing-gallery"/);
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent('');
	});

	it('blocks submit while markdown contains an incomplete content component marker', async () => {
		contentComponentLoaderMocks.loadContentComponentRegistryForMode.mockResolvedValue(
			createBuyButtonContentComponentRegistry()
		);

		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Body content',
				content: {
					mode: 'file',
					path: 'src/content/body.json'
				},
				blocks: [
					{
						id: 'body',
						type: 'markdown',
						label: 'Body',
						components: ['buy-button']
					}
				]
			},
			initialData: {
				body: ':buy-button[Broken]{href="https://example.com/buy"'
			}
		});

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('submit-error'))
			.toHaveTextContent(/could not parse directive attributes/i);
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent('');
	});
});
