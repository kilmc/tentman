import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';

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
			rootConfig: {
				assets: {
					path: 'static/images/',
					publicPath: '/images'
				}
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

import ImageField from './ImageField.svelte';

describe('components/form/ImageField.svelte', () => {
	beforeEach(() => {
		draftAssetStoreMocks.create.mockReset();
		draftAssetStoreMocks.delete.mockReset();
		draftAssetStoreMocks.resolveUrl.mockReset();
		draftAssetStoreMocks.readFile.mockReset();
		draftAssetStoreMocks.getMetadata.mockReset();
		draftAssetStoreMocks.getMetadataForContent.mockReset();
		draftAssetStoreMocks.collectFromContent.mockReset();
		draftAssetStoreMocks.gc.mockReset();
	});

	it('renders an existing staged draft ref and cleans up replaced or removed staged images', async () => {
		draftAssetStoreMocks.resolveUrl.mockResolvedValue('data:image/png;base64,ZXhpc3Rpbmc=');
		draftAssetStoreMocks.create.mockResolvedValue({
			ref: 'draft-asset:new-image',
			previewUrl: 'data:image/png;base64,bmV3',
			metadata: {
				id: 'new-image',
				ref: 'draft-asset:new-image',
				repoKey: 'github:acme/docs',
				storagePath: 'static/images/',
				originalName: 'hero.png',
				mimeType: 'image/png',
				size: 9,
				createdAt: '2026-04-06T12:00:00.000Z',
				targetFilename: 'hero-new-im.png',
				targetPath: 'static/images/hero-new-im.png',
				publicPath: '/images/hero-new-im.png',
				byteStore: 'idb',
				byteKey: 'github:acme/docs:new-image'
			}
		});
		draftAssetStoreMocks.delete.mockResolvedValue(undefined);

		const screen = await render(ImageField, {
			label: 'Hero image',
			value: 'draft-asset:existing-image',
			storagePath: 'static/images/'
		});

		await expectElement(screen.getByRole('img', { name: 'Hero image' })).toHaveAttribute(
			'src',
			'data:image/png;base64,ZXhpc3Rpbmc='
		);

		await screen.getByRole('button', { name: 'Upload new' }).click();
		await screen
			.getByLabelText('Upload image')
			.upload(new File(['next-image'], 'hero.png', { type: 'image/png' }));

		await expectElement(screen.getByText('draft-asset:new-image')).toBeVisible();
		await expectElement(screen.getByRole('img', { name: 'Hero image' })).toHaveAttribute(
			'src',
			'data:image/png;base64,bmV3'
		);
		expect(draftAssetStoreMocks.create).toHaveBeenCalledWith(
			expect.any(File),
			expect.objectContaining({
				repoKey: 'github:acme/docs',
				storagePath: 'static/images/'
			})
		);
		expect(draftAssetStoreMocks.delete).toHaveBeenCalledWith('draft-asset:existing-image');

		await screen.getByRole('button', { name: 'Remove image' }).click();

		expect(draftAssetStoreMocks.delete).toHaveBeenLastCalledWith('draft-asset:new-image');
		await expectElement(screen.getByRole('img', { name: 'Hero image' })).not.toBeInTheDocument();
	});

	it('selects an existing image for preview before Insert applies the public path', async () => {
		draftAssetStoreMocks.resolveUrl.mockResolvedValue('data:image/png;base64,ZXhpc3Rpbmc=');
		draftAssetStoreMocks.delete.mockResolvedValue(undefined);

		const onchange = vi.fn();
		const loadAssetEntries = vi.fn().mockResolvedValue([
			{
				name: 'hero.jpg',
				repoPath: 'static/images/hero.jpg',
				publicPath: '/images/hero.jpg',
				relativePath: 'hero.jpg',
				kind: 'image',
				extension: '.jpg'
			},
			{
				name: 'second.jpg',
				repoPath: 'static/images/second.jpg',
				publicPath: '/images/second.jpg',
				relativePath: 'second.jpg',
				kind: 'image',
				extension: '.jpg'
			}
		]);
		const screen = await render(ImageField, {
			label: 'Hero image',
			value: 'draft-asset:existing-image',
			storagePath: 'static/images/posts/',
			onchange,
			loadAssetEntries
		});

		await screen.getByRole('button', { name: 'Choose asset' }).click();
		await expectElement(screen.getByRole('dialog', { name: 'Choose image' })).toBeVisible();
		expect(loadAssetEntries).toHaveBeenCalledWith(
			expect.objectContaining({
				config: {
					assetPath: 'static/images/',
					publicPath: '/images'
				},
				mode: 'github'
			})
		);
		await screen.getByRole('button', { name: /second.jpg/ }).click();

		await expectElement(screen.getByText('/images/second.jpg', { exact: true })).toBeVisible();
		expect(onchange).not.toHaveBeenCalled();

		await screen.getByRole('button', { name: 'Insert' }).click();

		await expectElement(screen.getByText('/images/second.jpg', { exact: true })).toBeVisible();
		expect(onchange).toHaveBeenCalledOnce();
		expect(draftAssetStoreMocks.delete).toHaveBeenCalledWith('draft-asset:existing-image');
	});
});
