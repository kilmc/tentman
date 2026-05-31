import { describe, expect, it } from 'vitest';
import { buildConfigReviewSection } from './config-review';

const collectionConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		type: 'content',
		label: 'Posts',
		_tentmanId: 'posts',
		idField: 'slug',
		collection: {
			sorting: 'manual'
		},
		content: {
			mode: 'directory',
			path: 'src/content/posts',
			template: 'templates/post.md'
		},
		blocks: [{ id: 'title', type: 'text', label: 'Title' }]
	}
} as const;

const fieldOptions = {
	repoAssetContext: {
		owner: 'acme',
		repo: 'docs',
		baseBranch: 'main',
		draftBranch: 'tentman-preview'
	}
};

describe('review draft config review', () => {
	it('keeps deleted items anchored to their before-position in changed item order', () => {
		const section = buildConfigReviewSection({
			config: collectionConfig as never,
			beforeContent: [
				{ _tentmanId: 'a', slug: 'a', title: 'A' },
				{ _tentmanId: 'b', slug: 'b', title: 'B' },
				{ _tentmanId: 'c', slug: 'c', title: 'C' }
			],
			afterContent: [
				{ _tentmanId: 'a', slug: 'a', title: 'A' },
				{ _tentmanId: 'c', slug: 'c', title: 'C updated' }
			],
			baseManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: true,
				manifest: {
					version: 1,
					collections: {
						posts: {
							items: ['a', 'b', 'c']
						}
					}
				},
				error: null
			},
			draftManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: true,
				manifest: {
					version: 1,
					collections: {
						posts: {
							items: ['a', 'c']
						}
					}
				},
				error: null
			},
			baseRootConfig: null,
			draftRootConfig: null,
			fieldOptions,
			singleConfigVisible: false
		});

		expect(section?.items.map((item) => item.itemId)).toEqual(['b', 'c']);
	});

	it('produces one combined card when an item is both edited and moved', () => {
		const section = buildConfigReviewSection({
			config: collectionConfig as never,
			beforeContent: [
				{ _tentmanId: 'a', slug: 'a', title: 'A' },
				{ _tentmanId: 'b', slug: 'b', title: 'B' }
			],
			afterContent: [
				{ _tentmanId: 'b', slug: 'b', title: 'B' },
				{ _tentmanId: 'a', slug: 'a', title: 'A updated' }
			],
			baseManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: true,
				manifest: {
					version: 1,
					collections: {
						posts: {
							items: ['a', 'b']
						}
					}
				},
				error: null
			},
			draftManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: true,
				manifest: {
					version: 1,
					collections: {
						posts: {
							items: ['b', 'a']
						}
					}
				},
				error: null
			},
			baseRootConfig: null,
			draftRootConfig: null,
			fieldOptions,
			singleConfigVisible: false
		});

		expect(section?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					itemId: 'a',
					changeKinds: expect.arrayContaining(['edited', 'moved'])
				})
			])
		);
		expect(section?.items.filter((item) => item.itemId === 'a')).toHaveLength(1);
	});
});
