import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveUrl } = vi.hoisted(() => ({
	resolveUrl: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: {
		data: {
			selectedBackend: {
				kind: 'github'
			},
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			}
		}
	}
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		resolveUrl
	}
}));

import { resolveClientAssetUrl, resolveMarkdownAssetUrls } from './image-resolver';

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
		).resolves.toBe(
			'/api/repo/asset?value=hero.png&assetsDir=.%2Fstatic%2Fimages&owner=acme&repo=docs&branch=main'
		);
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it('routes GitHub-backed public asset paths through the repo proxy', async () => {
		await expect(
			resolveClientAssetUrl('/images/projects/hero.jpg', {
				previewBaseUrl: 'http://localhost:4173/'
			})
		).resolves.toBe(
			'/api/repo/asset?value=%2Fimages%2Fprojects%2Fhero.jpg&owner=acme&repo=docs&branch=main'
		);
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it('rewrites markdown image URLs through the same asset resolver', async () => {
		resolveUrl.mockResolvedValue('blob:draft-hero');

		await expect(
			resolveMarkdownAssetUrls('![Hero](hero.jpg)\n\n<img src="draft-asset:hero" alt="Hero">', {
				assetsDir: 'static/images/posts'
			})
		).resolves.toBe(
			'![Hero](/api/repo/asset?value=hero.jpg&assetsDir=static%2Fimages%2Fposts&owner=acme&repo=docs&branch=main)\n\n<img src="blob:draft-hero" alt="Hero">'
		);
		expect(resolveUrl).toHaveBeenCalledWith('draft-asset:hero');
	});
});
