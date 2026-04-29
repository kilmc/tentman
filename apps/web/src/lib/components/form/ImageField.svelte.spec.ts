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

		const screen = render(ImageField, {
			label: 'Hero image',
			value: 'draft-asset:existing-image',
			storagePath: 'static/images/'
		});

		await expect
			.element(screen.getByRole('img', { name: 'Hero image' }))
			.toHaveAttribute('src', 'data:image/png;base64,ZXhpc3Rpbmc=');

		await screen
			.getByLabelText('Hero image')
			.upload(new File(['next-image'], 'hero.png', { type: 'image/png' }));

		await expect.element(screen.getByText('draft-asset:new-image')).toBeVisible();
		await expect
			.element(screen.getByRole('img', { name: 'Hero image' }))
			.toHaveAttribute('src', 'data:image/png;base64,bmV3');
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
		await expect
			.element(screen.getByRole('img', { name: 'Hero image' }))
			.not.toBeInTheDocument();
	});
});
