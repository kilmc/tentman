import { describe, expect, it } from 'vitest';
import { createBrowserDraftAssetStore } from './store';

describe('draft-assets/store browser fallback', () => {
	it('stores staged files in IndexedDB when OPFS is unavailable', async () => {
		const previewUrl = 'data:image/png;base64,cHJldmlldw==';
		const store = createBrowserDraftAssetStore({
			databaseName: `tentman-draft-assets-test-${crypto.randomUUID()}`,
			storage: {
				persist: async () => true
			} as StorageManager,
			createObjectURL: () => previewUrl,
			revokeObjectURL: () => {},
			randomUUID: () => 'asset-fallback-12345678'
		});

		const file = new File(['fallback-bytes'], 'hero.png', { type: 'image/png' });
		const result = await store.create(file, {
			repoKey: 'local:test',
			storagePath: 'static/images/'
		});

		expect(result.ref).toBe('draft-asset:asset-fallback-12345678');
		expect(result.previewUrl).toBe(previewUrl);
		expect(result.metadata.byteStore).toBe('idb');
		expect(result.metadata.targetPath).toBe('static/images/hero-asset-fa.png');
		expect(await store.resolveUrl(result.ref)).toBe(previewUrl);
		await expect((await store.readFile(result.ref)).text()).resolves.toBe('fallback-bytes');
		await expect(store.getMetadata(result.ref)).resolves.toMatchObject({
			byteStore: 'idb',
			targetPath: 'static/images/hero-asset-fa.png'
		});
	});
});
