import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveUrl } = vi.hoisted(() => ({
	resolveUrl: vi.fn()
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		resolveUrl
	}
}));

import { resolveClientAssetUrl, resolveMarkdownAssetUrls } from './image-resolver';
import type { AssetRenderContext } from '$lib/features/assets/render-context';

const githubContext: AssetRenderContext = {
	mode: 'github',
	assets: { path: 'static/images/', publicPath: '/images' },
	repository: {
		owner: 'acme',
		name: 'docs',
		defaultBranch: 'main'
	}
};

describe('draft-assets/image-resolver', () => {
	beforeEach(() => {
		resolveUrl.mockReset();
	});

	it('resolves draft asset refs through the draft asset store', async () => {
		resolveUrl.mockResolvedValue('blob:draft-hero');

		await expect(resolveClientAssetUrl('draft-asset:hero', githubContext)).resolves.toBe(
			'blob:draft-hero'
		);
		expect(resolveUrl).toHaveBeenCalledWith('draft-asset:hero');
	});

	it('resolves normal static asset values without using the draft store', async () => {
		await expect(resolveClientAssetUrl('hero.png', githubContext)).resolves.toBe(
			'/api/repo/asset?value=hero.png&assetPath=static%2Fimages%2F&publicPath=%2Fimages&owner=acme&repo=docs&branch=main'
		);
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it('routes GitHub-backed public asset paths through the repo proxy', async () => {
		await expect(resolveClientAssetUrl('/images/projects/hero.jpg', githubContext)).resolves.toBe(
			'/api/repo/asset?value=%2Fimages%2Fprojects%2Fhero.jpg&assetPath=static%2Fimages%2F&publicPath=%2Fimages&owner=acme&repo=docs&branch=main'
		);
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it('rewrites markdown image URLs through the same asset resolver', async () => {
		resolveUrl.mockResolvedValue('blob:draft-hero');

		await expect(
			resolveMarkdownAssetUrls('![Hero](hero.jpg)\n\n<img src="draft-asset:hero" alt="Hero">', {
				mode: 'github',
				assets: { path: 'static/images/posts/', publicPath: '/images/posts' },
				repository: {
					owner: 'acme',
					name: 'docs',
					defaultBranch: 'main'
				}
			})
		).resolves.toBe(
			'![Hero](/api/repo/asset?value=hero.jpg&assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts&owner=acme&repo=docs&branch=main)\n\n<img src="blob:draft-hero" alt="Hero">'
		);
		expect(resolveUrl).toHaveBeenCalledWith('draft-asset:hero');
	});
});
