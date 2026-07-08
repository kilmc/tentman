import { describe, expect, it } from 'vitest';
import {
	buildDraftAssetMetadata,
	buildDraftAssetRef,
	collectDraftAssetRefsFromContent,
	collectDraftAssetRefsFromString,
	mergeChangesSummaryWithDraftAssets,
	resolveDraftAssetStoragePath,
	replaceDraftAssetRefsInString,
	replaceDraftAssetRefsInContent
} from './shared';

describe('draft-assets/shared', () => {
	it('builds deterministic target filenames and public paths from the storage path', () => {
		const metadata = buildDraftAssetMetadata({
			id: 'asset-12345678',
			repoKey: 'github:acme/docs',
			storagePath: './static/images/seo',
			publicPath: '/images/seo',
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
			publicPath: '/images/posts',
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

	it('resolves configured storage paths from the owning content config path', () => {
		expect(
			resolveDraftAssetStoragePath({
				configPath: 'tentman/configs/posts.tentman.json',
				storagePath: './static/images/posts',
				defaultStoragePath: './static/images'
			})
		).toBe('tentman/configs/static/images/posts/');

		expect(
			resolveDraftAssetStoragePath({
				configPath: 'tentman/configs/posts.tentman.json',
				defaultStoragePath: './static/images'
			})
		).toBe('tentman/configs/static/images/');
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

	it('collects draft refs from markdown asset destinations and html media tags only', () => {
		const firstRef = buildDraftAssetRef('first');
		const secondRef = buildDraftAssetRef('second');
		const thirdRef = buildDraftAssetRef('third');
		const fourthRef = buildDraftAssetRef('fourth');
		const fifthRef = buildDraftAssetRef('fifth');
		const sixthRef = buildDraftAssetRef('sixth');

		expect(
			collectDraftAssetRefsFromString(
				[
					`Intro prose with ${firstRef} should be ignored.`,
					`![Hero](${firstRef})`,
					`[Download](<${thirdRef}>)`,
					`<img src="${secondRef}" alt="Cover">`,
					`<audio controls src="${fourthRef}"></audio>`,
					`<video controls><source src="${fifthRef}"></video>`,
					`<track src="${sixthRef}" kind="captions">`,
					`![Gallery](https://example.com/image.png)`
				].join('\n\n')
			)
		).toEqual([firstRef, thirdRef, secondRef, fourthRef, fifthRef, sixthRef]);
	});

	it('rewrites inline markdown and html media refs while preserving exact-string image refs', () => {
		const firstRef = buildDraftAssetRef('first');
		const secondRef = buildDraftAssetRef('second');
		const thirdRef = buildDraftAssetRef('third');
		const replacements = new Map([
			[firstRef, '/images/hero.png'],
			[secondRef, '/images/cover.png'],
			[thirdRef, '/media/interview.mp3']
		]);

		expect(replaceDraftAssetRefsInString(firstRef, replacements)).toBe('/images/hero.png');
		expect(
			replaceDraftAssetRefsInString(
				`![Hero](${firstRef} "Hero title")\n\n<img src="${secondRef}" alt="Cover">\n\n<audio controls src="${thirdRef}"></audio>`,
				replacements
			)
		).toBe(
			'![Hero](/images/hero.png "Hero title")\n\n<img src="/images/cover.png" alt="Cover">\n\n<audio controls src="/media/interview.mp3"></audio>'
		);
	});

	it('collects and rewrites multiple markdown image refs inside content fields', () => {
		const firstRef = buildDraftAssetRef('first');
		const secondRef = buildDraftAssetRef('second');
		const content = {
			body: `![Hero](${firstRef})\n\nSome prose\n\n![](${secondRef})`,
			hero: firstRef
		};

		expect(collectDraftAssetRefsFromContent(content)).toEqual([firstRef, secondRef]);
		expect(
			replaceDraftAssetRefsInContent(
				content,
				new Map([
					[firstRef, '/images/hero.png'],
					[secondRef, '/images/gallery.png']
				])
			)
		).toEqual({
			body: '![Hero](/images/hero.png)\n\nSome prose\n\n![](/images/gallery.png)',
			hero: '/images/hero.png'
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
