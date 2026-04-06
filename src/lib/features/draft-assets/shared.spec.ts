import { describe, expect, it } from 'vitest';
import {
	buildDraftAssetMetadata,
	buildDraftAssetRef,
	collectDraftAssetRefsFromContent,
	mergeChangesSummaryWithDraftAssets,
	replaceDraftAssetRefsInContent
} from './shared';

describe('draft-assets/shared', () => {
	it('builds deterministic target filenames and public paths from the storage path', () => {
		const metadata = buildDraftAssetMetadata({
			id: 'asset-12345678',
			repoKey: 'github:acme/docs',
			storagePath: './static/images/seo',
			originalName: 'Hero Banner.PNG',
			mimeType: 'image/png',
			size: 1024,
			byteStore: 'idb',
			byteKey: 'github:acme/docs:asset-12345678'
		});

		expect(metadata.targetFilename).toBe('hero-banner-asset-12.png');
		expect(metadata.targetPath).toBe('static/images/seo/hero-banner-asset-12.png');
		expect(metadata.publicPath).toBe('/images/seo/hero-banner-asset-12.png');
	});

	it('normalizes relative parent segments out of asset storage paths', () => {
		const metadata = buildDraftAssetMetadata({
			id: 'asset-12345678',
			repoKey: 'local:test-app',
			storagePath: '../../static/images/posts',
			originalName: 'Cover Image.png',
			mimeType: 'image/png',
			size: 1024,
			byteStore: 'idb',
			byteKey: 'local:test-app:asset-12345678'
		});

		expect(metadata.storagePath).toBe('static/images/posts/');
		expect(metadata.targetPath).toBe('static/images/posts/cover-image-asset-12.png');
		expect(metadata.publicPath).toBe('/images/posts/cover-image-asset-12.png');
	});

	it('collects unique draft refs and rewrites them to final public paths', () => {
		const firstRef = buildDraftAssetRef('first');
		const secondRef = buildDraftAssetRef('second');
		const content = {
			hero: firstRef,
			gallery: [{ image: firstRef }, { image: secondRef }],
			nested: {
				cover: secondRef
			}
		};

		expect(collectDraftAssetRefsFromContent(content)).toEqual([firstRef, secondRef]);

		expect(
			replaceDraftAssetRefsInContent(
				content,
				new Map([
					[firstRef, '/images/hero.png'],
					[secondRef, '/images/cover.png']
				])
			)
		).toEqual({
			hero: '/images/hero.png',
			gallery: [{ image: '/images/hero.png' }, { image: '/images/cover.png' }],
			nested: {
				cover: '/images/cover.png'
			}
		});
	});

	it('merges synthetic asset file changes into preview totals', () => {
		expect(
			mergeChangesSummaryWithDraftAssets(
				{
					totalChanges: 1,
					files: [{ path: 'content/about.md', type: 'update' }]
				},
				[{ path: 'static/images/hero.png', type: 'create', size: 512 }]
			)
		).toEqual({
			totalChanges: 2,
			files: [
				{ path: 'content/about.md', type: 'update' },
				{ path: 'static/images/hero.png', type: 'create', size: 512 }
			]
		});
	});
});
