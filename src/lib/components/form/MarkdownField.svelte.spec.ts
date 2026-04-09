import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

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

import MarkdownField from './MarkdownField.svelte';

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
		draftAssetStoreMocks.delete.mockResolvedValue(undefined);
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

	it('updates toolbar pressed states when keyboard shortcuts toggle formatting', async () => {
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

		richEditor.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'b',
				metaKey: true,
				bubbles: true,
				cancelable: true
			})
		);

		await expect
			.element(screen.getByRole('button', { name: 'Bold' }))
			.toHaveAttribute('aria-pressed', 'true');

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await expect.element(screen.getByLabelText('Body')).toHaveValue('**Hello world**');
	});
});
