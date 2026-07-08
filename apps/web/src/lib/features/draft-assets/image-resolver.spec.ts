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
			resolveMarkdownAssetUrls(
				[
					'![Hero](hero.jpg)',
					'[Download](brief.pdf)',
					'<img src="draft-asset:hero" alt="Hero">',
					'<audio controls src="interview.mp3"></audio>',
					'<video controls><source src="/images/trailer.mp4" type="video/mp4"><track src="captions.vtt"></video>'
				].join('\n\n'),
				{
					mode: 'github',
					assets: { path: 'static/images/posts/', publicPath: '/images/posts' },
					repository: {
						owner: 'acme',
						name: 'docs',
						defaultBranch: 'main'
					}
				}
			)
		).resolves.toBe(
			[
				'![Hero](/api/repo/asset?value=hero.jpg&assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts&owner=acme&repo=docs&branch=main)',
				'[Download](/api/repo/asset?value=brief.pdf&assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts&owner=acme&repo=docs&branch=main)',
				'<img src="blob:draft-hero" alt="Hero">',
				'<audio controls src="/api/repo/asset?value=interview.mp3&assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts&owner=acme&repo=docs&branch=main"></audio>',
				'<video controls><source src="/api/repo/asset?value=%2Fimages%2Ftrailer.mp4&assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts&owner=acme&repo=docs&branch=main" type="video/mp4"><track src="/api/repo/asset?value=captions.vtt&assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts&owner=acme&repo=docs&branch=main"></video>'
			].join('\n\n')
		);
		expect(resolveUrl).toHaveBeenCalledWith('draft-asset:hero');
	});
});
