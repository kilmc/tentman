import { describe, expect, it, vi } from 'vitest';
import type { RepositoryBackend } from '$lib/repository/types';
import { materializeDraftAssets } from './materialize';
import type { DraftAssetStore } from './types';
import { buildDraftAssetRef } from './shared';

function createBackend() {
	return {
		kind: 'local',
		cacheKey: 'local:test',
		label: 'Local test',
		supportsDraftBranches: false,
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

function createStore(): DraftAssetStore {
	const firstRef = buildDraftAssetRef('first');
	const secondRef = buildDraftAssetRef('second');
	const metadataByRef = new Map([
		[
			firstRef,
			{
				id: 'first',
				ref: firstRef,
				repoKey: 'local:test',
				storagePath: 'static/images/',
				originalName: 'hero.png',
				mimeType: 'image/png',
				size: 4,
				createdAt: new Date('2026-04-06T10:00:00.000Z').toISOString(),
				targetFilename: 'hero-first.png',
				targetPath: 'static/images/hero-first.png',
				publicPath: '/images/hero-first.png',
				byteStore: 'idb' as const,
				byteKey: 'first'
			}
		],
		[
			secondRef,
			{
				id: 'second',
				ref: secondRef,
				repoKey: 'local:test',
				storagePath: 'static/images/',
				originalName: 'gallery.png',
				mimeType: 'image/png',
				size: 6,
				createdAt: new Date('2026-04-06T10:00:00.000Z').toISOString(),
				targetFilename: 'gallery-second.png',
				targetPath: 'static/images/gallery-second.png',
				publicPath: '/images/gallery-second.png',
				byteStore: 'idb' as const,
				byteKey: 'second'
			}
		]
	]);

	return {
		create: vi.fn(),
		readFile: vi.fn(async (ref: string) => {
			const metadata = metadataByRef.get(ref);
			if (!metadata) {
				throw new Error(`Missing ${ref}`);
			}

			return new File([`${metadata.id}-bytes`], metadata.originalName, {
				type: metadata.mimeType
			});
		}),
		resolveUrl: vi.fn(async () => null),
		delete: vi.fn(async () => {}),
		getMetadata: vi.fn(async (ref: string) => metadataByRef.get(ref) ?? null),
		getMetadataForContent: vi.fn(async () => []),
		collectFromContent: vi.fn(() => []),
		gc: vi.fn(async () => {})
	};
}

describe('draft-assets/materialize', () => {
	it('writes staged assets for local saves, rewrites content, and returns cleanup refs', async () => {
		const backend = createBackend();
		const store = createStore();
		const firstRef = buildDraftAssetRef('first');
		const secondRef = buildDraftAssetRef('second');

		const result = await materializeDraftAssets({
			backend,
			store,
			content: {
				hero: firstRef,
				sections: [{ image: firstRef }, { image: secondRef }]
			}
		});

		expect(backend.writeBinaryFile).toHaveBeenCalledTimes(2);
		expect(backend.writeBinaryFile).toHaveBeenNthCalledWith(
			1,
			'static/images/hero-first.png',
			expect.any(Uint8Array),
			undefined
		);
		expect(backend.writeBinaryFile).toHaveBeenNthCalledWith(
			2,
			'static/images/gallery-second.png',
			expect.any(Uint8Array),
			undefined
		);
		expect(result.content).toEqual({
			hero: '/images/hero-first.png',
			sections: [{ image: '/images/hero-first.png' }, { image: '/images/gallery-second.png' }]
		});
		expect(result.fileChanges).toEqual([
			{ path: 'static/images/hero-first.png', type: 'create', size: 4 },
			{ path: 'static/images/gallery-second.png', type: 'create', size: 6 }
		]);
		expect(result.cleanedRefs).toEqual([firstRef, secondRef]);
	});
});
