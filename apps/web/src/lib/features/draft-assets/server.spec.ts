import { describe, expect, it, vi } from 'vitest';
import type { RepositoryBackend } from '$lib/repository/types';
import { materializeDraftAssetsFromFormData } from './server';
import { buildDraftAssetRef } from './shared';

const ROOT_ASSETS = {
	path: 'static/images/',
	publicPath: '/images'
};

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
	function appendDraftAsset(formData: FormData, input: { id: string; storagePath: string }) {
		const ref = buildDraftAssetRef(input.id);

		formData.set(
			`draftAssetFile:${input.id}`,
			new File(['12345'], `${input.id}.png`, { type: 'image/png' })
		);

		return {
			id: input.id,
			ref,
			storagePath: input.storagePath,
			originalName: `${input.id}.png`,
			mimeType: 'image/png',
			size: 5,
			targetFilename: `${input.id}-asset.png`,
			targetPath: `${input.storagePath}${input.id}-asset.png`,
			publicPath: `/images/${input.id}-asset.png`
		};
	}

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
					storagePath: 'static/images/',
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
			configPath: 'content/posts.tentman.json',
			blocks: [{ id: 'body', type: 'markdown' }],
			backend,
			assets: ROOT_ASSETS,
			writeOptions: {
				ref: 'draft/preview-branch'
			}
		});

		expect(backend.writeBinaryFile).toHaveBeenCalledWith(
			'static/images/hero-hero.png',
			expect.any(Uint8Array),
			{ ref: 'draft/preview-branch' }
		);
		expect(result.content).toEqual({
			body: '![Hero](/images/hero-hero.png)'
		});
		expect(result.fileChanges).toEqual([
			{ path: 'static/images/hero-hero.png', type: 'create', size: 5 }
		]);
		expect(result.cleanedRefs).toEqual([heroRef]);
	});

	it('rejects staged assets using legacy block storage paths', async () => {
		const backend = createBackend();
		const formData = new FormData();
		const heroRef = buildDraftAssetRef('hero');
		const heroEntry = appendDraftAsset(formData, {
			id: 'hero',
			storagePath: 'content/static/images/posts/'
		});
		formData.set('draftAssetManifest', JSON.stringify([heroEntry]));

		await expect(materializeDraftAssetsFromFormData({
			formData,
			content: {
				body: `![Hero](${heroRef})`
			},
			configPath: 'content/posts.tentman.json',
			blocks: [{ id: 'body', type: 'markdown', assetsDir: './static/images/posts' }],
			backend,
			assets: ROOT_ASSETS
		})).rejects.toThrow(`Draft asset storage path is not allowed for ${heroRef}`);
	});

	it('materializes multiple staged assets through the same write options', async () => {
		const backend = createBackend();
		const formData = new FormData();
		const heroRef = buildDraftAssetRef('hero');
		const galleryRef = buildDraftAssetRef('gallery');
		const entries = [
			appendDraftAsset(formData, { id: 'hero', storagePath: 'static/images/' }),
			appendDraftAsset(formData, { id: 'gallery', storagePath: 'static/images/' })
		];
		formData.set('draftAssetManifest', JSON.stringify(entries));

		const result = await materializeDraftAssetsFromFormData({
			formData,
			content: {
				hero: heroRef,
				gallery: galleryRef
			},
			configPath: 'content/posts.tentman.json',
			blocks: [
				{ id: 'hero', type: 'image' },
				{ id: 'gallery', type: 'image' }
			],
			backend,
			assets: ROOT_ASSETS,
			writeOptions: {
				ref: 'draft/preview-branch'
			}
		});

		expect(backend.writeBinaryFile).toHaveBeenCalledTimes(2);
		expect(backend.writeBinaryFile).toHaveBeenNthCalledWith(
			1,
			'static/images/hero-hero.png',
			expect.any(Uint8Array),
			{ ref: 'draft/preview-branch' }
		);
		expect(backend.writeBinaryFile).toHaveBeenNthCalledWith(
			2,
			'static/images/gallery-gallery.png',
			expect.any(Uint8Array),
			{ ref: 'draft/preview-branch' }
		);
		expect(result.content).toEqual({
			hero: '/images/hero-hero.png',
			gallery: '/images/gallery-gallery.png'
		});
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
					storagePath: 'static/images/',
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
				configPath: 'content/posts.tentman.json',
				blocks: [{ id: 'body', type: 'markdown' }],
				backend,
				assets: ROOT_ASSETS
			})
		).rejects.toThrow(`Draft asset file is missing for ${heroRef}`);
	});

	it('ignores tampered target paths and recomputes the final repo write path on the server', async () => {
		const backend = createBackend();
		const formData = new FormData();
		const heroRef = buildDraftAssetRef('hero');

		formData.set(
			'draftAssetManifest',
			JSON.stringify([
				{
					id: 'hero',
					ref: heroRef,
					storagePath: 'static/images/',
					originalName: 'hero.png',
					mimeType: 'image/png',
					size: 5,
					targetFilename: 'evil.js',
					targetPath: 'src/routes/+page.server.ts',
					publicPath: '/images/evil.js'
				}
			])
		);
		formData.set('draftAssetFile:hero', new File(['12345'], 'hero.png', { type: 'image/png' }));

		const result = await materializeDraftAssetsFromFormData({
			formData,
			content: {
				body: `![Hero](${heroRef})`
			},
			configPath: 'content/posts.tentman.json',
			blocks: [{ id: 'body', type: 'markdown' }],
			backend,
			assets: ROOT_ASSETS
		});

		expect(backend.writeBinaryFile).toHaveBeenCalledWith(
			'static/images/hero-hero.png',
			expect.any(Uint8Array),
			undefined
		);
		expect(result.content).toEqual({
			body: '![Hero](/images/hero-hero.png)'
		});
	});

	it('rejects draft asset writes outside the configured asset locations', async () => {
		const backend = createBackend();
		const formData = new FormData();
		const heroRef = buildDraftAssetRef('hero');

		formData.set(
			'draftAssetManifest',
			JSON.stringify([
				{
					id: 'hero',
					ref: heroRef,
					storagePath: 'src/routes/',
					originalName: 'hero.png',
					mimeType: 'image/png',
					size: 5,
					targetFilename: 'evil.js',
					targetPath: 'src/routes/+page.server.ts',
					publicPath: '/not-the-real-path'
				}
			])
		);
		formData.set('draftAssetFile:hero', new File(['12345'], 'hero.png', { type: 'image/png' }));

		await expect(
			materializeDraftAssetsFromFormData({
				formData,
				content: {
					body: `![Hero](${heroRef})`
				},
				configPath: 'content/posts.tentman.json',
				blocks: [{ id: 'body', type: 'markdown', assetsDir: './static/images/posts' }],
				backend,
				assets: ROOT_ASSETS
			})
		).rejects.toThrow(`Draft asset storage path is not allowed for ${heroRef}`);
	});
});
