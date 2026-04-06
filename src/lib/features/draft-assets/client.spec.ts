import { describe, expect, it, vi } from 'vitest';
import { appendDraftAssetsToFormData, getDraftAssetPreviewChanges } from './client';
import type { DraftAssetStore } from './types';
import { buildDraftAssetRef } from './shared';

function createStore(): DraftAssetStore {
	const heroRef = buildDraftAssetRef('hero');

	return {
		create: vi.fn(),
		readFile: vi.fn(async () => new File(['image-bytes'], 'hero.png', { type: 'image/png' })),
		resolveUrl: vi.fn(async () => 'blob:hero'),
		delete: vi.fn(async () => {}),
		getMetadata: vi.fn(async (ref: string) =>
			ref === heroRef
				? {
						id: 'hero',
						ref: heroRef,
						repoKey: 'github:acme/docs',
						storagePath: 'static/images/',
						originalName: 'hero.png',
						mimeType: 'image/png',
						size: 11,
						createdAt: new Date('2026-04-06T10:00:00.000Z').toISOString(),
						targetFilename: 'hero-asset.png',
						targetPath: 'static/images/hero-asset.png',
						publicPath: '/images/hero-asset.png',
						byteStore: 'idb' as const,
						byteKey: 'hero'
					}
				: null
		),
		getMetadataForContent: vi.fn(async () => []),
		collectFromContent: vi.fn(() => []),
		gc: vi.fn(async () => {})
	};
}

describe('draft-assets/client', () => {
	it('appends the manifest and staged file parts for explicit preview submissions', async () => {
		const store = createStore();
		const heroRef = buildDraftAssetRef('hero');
		const formData = new FormData();

		const result = await appendDraftAssetsToFormData(
			formData,
			{
				hero: heroRef
			},
			store
		);

		expect(result.refs).toEqual([heroRef]);
		expect(JSON.parse(String(formData.get('draftAssetManifest')))).toEqual([
			{
				id: 'hero',
				ref: heroRef,
				originalName: 'hero.png',
				mimeType: 'image/png',
				size: 11,
				targetFilename: 'hero-asset.png',
				targetPath: 'static/images/hero-asset.png',
				publicPath: '/images/hero-asset.png'
			}
		]);
		expect(formData.get('draftAssetFile:hero')).toBeInstanceOf(File);
	});

	it('builds synthetic preview file changes for staged assets', async () => {
		const store = createStore();
		const heroRef = buildDraftAssetRef('hero');

		await expect(
			getDraftAssetPreviewChanges(
				{
					hero: heroRef
				},
				store
			)
		).resolves.toEqual([{ path: 'static/images/hero-asset.png', type: 'create', size: 11 }]);
	});
});
