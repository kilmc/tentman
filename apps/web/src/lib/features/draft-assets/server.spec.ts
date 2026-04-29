import { describe, expect, it, vi } from 'vitest';
import type { RepositoryBackend } from '$lib/repository/types';
import { materializeDraftAssetsFromFormData } from './server';
import { buildDraftAssetRef } from './shared';

function createBackend() {
	return {
		kind: 'github',
		cacheKey: 'github:acme/docs',
		label: 'acme/docs',
		supportsDraftBranches: true,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(),
		writeTextFile: vi.fn(),
		writeBinaryFile: vi.fn(async () => {}),
		deleteFile: vi.fn(),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false)
	} satisfies RepositoryBackend;
}

describe('draft-assets/server', () => {
	it('materializes staged assets from enhanced GitHub preview submissions', async () => {
		const backend = createBackend();
		const formData = new FormData();
		const heroRef = buildDraftAssetRef('hero');

		formData.set(
			'draftAssetManifest',
			JSON.stringify([
				{
					id: 'hero',
					ref: heroRef,
					originalName: 'hero.png',
					mimeType: 'image/png',
					size: 5,
					targetFilename: 'hero-asset.png',
					targetPath: 'static/images/hero-asset.png',
					publicPath: '/images/hero-asset.png'
				}
			])
		);
		formData.set('draftAssetFile:hero', new File(['12345'], 'hero.png', { type: 'image/png' }));

		const result = await materializeDraftAssetsFromFormData({
			formData,
			content: {
				body: `![Hero](${heroRef})`
			},
			backend,
			writeOptions: {
				ref: 'draft/preview-branch'
			}
		});

		expect(backend.writeBinaryFile).toHaveBeenCalledWith(
			'static/images/hero-asset.png',
			expect.any(Uint8Array),
			{ ref: 'draft/preview-branch' }
		);
		expect(result.content).toEqual({
			body: '![Hero](/images/hero-asset.png)'
		});
		expect(result.fileChanges).toEqual([
			{ path: 'static/images/hero-asset.png', type: 'create', size: 5 }
		]);
		expect(result.cleanedRefs).toEqual([heroRef]);
	});

	it('throws a clear error when a staged markdown file part is missing', async () => {
		const backend = createBackend();
		const formData = new FormData();
		const heroRef = buildDraftAssetRef('hero');

		formData.set(
			'draftAssetManifest',
			JSON.stringify([
				{
					id: 'hero',
					ref: heroRef,
					originalName: 'hero.png',
					mimeType: 'image/png',
					size: 5,
					targetFilename: 'hero-asset.png',
					targetPath: 'static/images/hero-asset.png',
					publicPath: '/images/hero-asset.png'
				}
			])
		);

		await expect(
			materializeDraftAssetsFromFormData({
				formData,
				content: {
					body: `![Hero](${heroRef})`
				},
				backend
			})
		).rejects.toThrow(`Draft asset file is missing for ${heroRef}`);
	});
});
