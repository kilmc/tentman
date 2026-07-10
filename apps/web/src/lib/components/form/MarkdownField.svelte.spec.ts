import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectElement, render } from '$lib/test-support/browser-test';
import MarkdownField from './MarkdownField.svelte';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import type { AssetPickerEntry, AssetPickerFilter } from '$lib/features/assets/asset-picker';
import type { DraftAssetMetadata } from '$lib/features/draft-assets/types';
import SemanticMarkdownFieldHarness from '$lib/test/fixtures/SemanticMarkdownFieldHarness.svelte';

const emptyContentComponentRegistry: ContentComponentRegistry = {
	components: [],
	errors: [],
	getByName() {
		return undefined;
	}
};

describe('components/form/MarkdownField.svelte', () => {
	const rootConfig = {
		assets: {
			path: 'static/media',
			publicPath: '/media'
		}
	};

	function createAssetEntry(filter: AssetPickerFilter, name: string): AssetPickerEntry {
		return {
			name,
			repoPath: `static/media/${name}`,
			publicPath: `/media/${name}`,
			relativePath: name,
			kind: filter.kind,
			extension: name.slice(name.lastIndexOf('.')).toLowerCase()
		};
	}

	function createDraftAssetMetadata(ref: string, originalName: string): DraftAssetMetadata {
		const id = ref.replace(/^draft-asset:/, '');
		return {
			id,
			ref,
			repoKey: 'github:acme/docs',
			storagePath: 'static/media',
			originalName,
			mimeType: 'image/png',
			size: originalName.length,
			createdAt: '2026-07-10T00:00:00.000Z',
			targetFilename: originalName,
			targetPath: `static/media/${originalName}`,
			publicPath: `/media/${originalName}`,
			byteStore: 'idb',
			byteKey: `github:acme/docs:${id}`
		};
	}

	it('does not emit a change when the rich editor is only focused', async () => {
		const onchange = vi.fn();
		await render(MarkdownField, {
			label: 'Body',
			value: 'Original body\n',
			onchange,
			testAdapters: {
				componentMode: 'local',
				loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry
			}
		});

		await vi.waitFor(() => {
			expect(document.querySelector<HTMLElement>('.ProseMirror')).toBeTruthy();
		});

		await document.querySelector<HTMLElement>('.ProseMirror')?.click();

		expect(onchange).not.toHaveBeenCalled();
	});

	it('returns to semantic clean when markdown text returns to the baseline document', async () => {
		const screen = await render(SemanticMarkdownFieldHarness);

		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('clean');

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await screen.getByLabelText('Body').fill('Original bodyx');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('dirty');

		await screen.getByLabelText('Body').fill('Original body');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('clean');
	});

	it('returns to semantic clean when a rich editor insertion is deleted', async () => {
		const screen = await render(SemanticMarkdownFieldHarness, {
			value: 'Original body',
			baseline: 'Original body'
		});

		await screen.getByText('Original body').click();
		await userEvent.keyboard('p');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('dirty');

		await userEvent.keyboard('{Backspace}');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('clean');
	});

	it('renders existing audio and video HTML as rich editor media nodes', async () => {
		await render(MarkdownField, {
			label: 'Body',
			value:
				'<audio controls src="/media/interview.mp3"></audio>\n\n<video controls src="/media/trailer.mp4"></video>',
			testAdapters: {
				componentMode: 'local',
				rootConfig,
				loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry
			}
		});

		await vi.waitFor(() => {
			expect(document.querySelector('audio[src="/media/interview.mp3"]')).toBeTruthy();
			expect(document.querySelector('video[src="/media/trailer.mp4"]')).toBeTruthy();
		});
	});

	it('inserts existing audio and video assets through TipTap media nodes', async () => {
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '',
			testAdapters: {
				componentMode: 'local',
				rootConfig,
				loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry,
				loadAssetEntries: async ({ filter }: { filter: AssetPickerFilter }) => [
					createAssetEntry(filter, filter.kind === 'audio' ? 'interview.mp3' : 'trailer.mp4')
				]
			}
		});

		await screen.getByRole('button', { name: 'Audio' }).click();
		await screen.getByRole('button', { name: 'Existing assets' }).click();
		await screen.getByRole('button', { name: 'Insert' }).click();
		await screen.getByRole('button', { name: 'Video' }).click();
		await screen.getByRole('button', { name: 'Existing assets' }).click();
		await screen.getByRole('button', { name: 'Insert' }).click();
		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expectElement(screen.getByLabelText('Body')).toHaveValue(
			'<audio controls src="/media/interview.mp3"></audio>\n\n<video controls src="/media/trailer.mp4"></video>\n\n'
		);
	});

	it('inserts existing files as native markdown links', async () => {
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '',
			testAdapters: {
				componentMode: 'local',
				rootConfig,
				loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry,
				loadAssetEntries: async ({ filter }: { filter: AssetPickerFilter }) => [
					createAssetEntry(filter, 'brief.pdf')
				]
			}
		});

		await screen.getByTestId('markdown-rich-toolbar').getByRole('button', { name: 'File' }).click();
		await screen.getByRole('button', { name: 'Existing assets' }).click();
		await screen.getByRole('button', { name: 'Insert' }).click();
		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expectElement(screen.getByLabelText('Body')).toHaveValue('[brief.pdf](/media/brief.pdf)');
	});

	it('uploads and inserts multiple image assets in one picker selection', async () => {
		const draftAssetStore = {
			create: vi
				.fn()
				.mockResolvedValueOnce({
					ref: 'draft-asset:first-image',
					previewUrl: null,
					metadata: createDraftAssetMetadata('draft-asset:first-image', 'first.png')
				})
				.mockResolvedValueOnce({
					ref: 'draft-asset:second-image',
					previewUrl: null,
					metadata: createDraftAssetMetadata('draft-asset:second-image', 'second.png')
				}),
			readFile: vi.fn(),
			resolveUrl: vi.fn(async () => null),
			delete: vi.fn(async () => undefined),
			getMetadata: vi.fn(async () => null),
			getMetadataForContent: vi.fn(async () => []),
			collectFromContent: vi.fn(() => []),
			gc: vi.fn(async () => undefined)
		};
		const screen = await render(MarkdownField, {
			label: 'Body',
			value: '',
			storagePath: 'static/media',
			testAdapters: {
				repoKey: 'github:acme/docs',
				componentMode: 'local',
				rootConfig,
				draftAssetStore,
				loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry
			}
		});

		await screen.getByRole('button', { name: 'Image' }).click();
		await screen.getByLabelText('Upload image').upload([
			new File(['first'], 'first.png', { type: 'image/png' }),
			new File(['second'], 'second.png', { type: 'image/png' })
		]);
		await screen.getByRole('button', { name: 'Markdown' }).click();

		await expectElement(screen.getByLabelText('Body')).toHaveValue(
			'![](draft-asset:first-image)\n\n![](draft-asset:second-image)\n\n'
		);
		expect(draftAssetStore.create).toHaveBeenCalledTimes(2);
		expect(draftAssetStore.create).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ name: 'first.png' }),
			expect.objectContaining({ repoKey: 'github:acme/docs' })
		);
		expect(draftAssetStore.create).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ name: 'second.png' }),
			expect.objectContaining({ repoKey: 'github:acme/docs' })
		);
	});
});
