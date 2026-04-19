import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveUrl } = vi.hoisted(() => ({
	resolveUrl: vi.fn()
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		resolveUrl
	}
}));

import { resolveClientAssetUrl } from './image-resolver';

describe('draft-assets/image-resolver', () => {
	beforeEach(() => {
		resolveUrl.mockReset();
	});

	it('resolves draft asset refs through the draft asset store', async () => {
		resolveUrl.mockResolvedValue('blob:draft-hero');

		await expect(resolveClientAssetUrl('draft-asset:hero')).resolves.toBe('blob:draft-hero');
		expect(resolveUrl).toHaveBeenCalledWith('draft-asset:hero');
	});

	it('resolves normal static asset values without using the draft store', async () => {
		await expect(
			resolveClientAssetUrl('hero.png', {
				assetsDir: './static/images'
			})
		).resolves.toBe('/images/hero.png');
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it('resolves absolute public paths against the local preview base URL', async () => {
		await expect(
			resolveClientAssetUrl('/images/projects/hero.jpg', {
				previewBaseUrl: 'http://localhost:4173/'
			})
		).resolves.toBe('http://localhost:4173/images/projects/hero.jpg');
		expect(resolveUrl).not.toHaveBeenCalled();
	});
});
