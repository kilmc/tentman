import { describe, expect, it } from 'vitest';
import type { DiscoveredConfig } from '$lib/config/discovery';
import {
	areNavigationDraftsEqual,
	createNavigationDraft,
	serializeNavigationDraft,
	setNavigationDraftCollectionGroupItems,
	setNavigationDraftCollectionUngroupedItems,
	setNavigationDraftContentOrder
} from '$lib/features/content-management/navigation-draft';

const configs: DiscoveredConfig[] = [
	{
		slug: 'about',
		path: 'content/about.tentman.json',
		config: {
			type: 'content',
			_tentmanId: 'about',
			label: 'About Page',
			collection: false,
			content: {
				mode: 'file',
				path: 'src/content/about.json'
			},
			blocks: []
		}
	},
	{
		slug: 'blog',
		path: 'content/blog.tentman.json',
		config: {
			type: 'content',
			_tentmanId: 'blog',
			label: 'Blog Posts',
			collection: {
				sorting: 'manual',
				groups: [{ _tentmanId: 'featured', label: 'Featured', slug: 'featured' }]
			},
			idField: 'slug',
			content: {
				mode: 'directory',
				path: 'src/content/posts',
				template: 'templates/post.md'
			},
			blocks: []
		}
	}
];

const rootConfig = { content: { sorting: 'manual' as const } };

describe('navigation draft helpers', () => {
	it('creates a draft from ordered top-level configs and loaded collection navigation', () => {
		expect(
			createNavigationDraft(
				configs,
				{
					version: 1,
					content: {
						items: ['blog', 'about']
					},
					collections: {
						blog: {
							items: ['post-2', 'post-1'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['post-2']
								}
							]
						}
					}
				},
				{
					blog: {
						groups: [
							{
								id: 'featured',
								label: 'Featured',
								items: [{ itemId: 'post-2', title: 'Second post' }]
							}
						],
						items: [
							{ itemId: 'post-1', title: 'Hello world' },
							{ itemId: 'post-3', title: 'Third post' }
						]
					}
				},
				rootConfig
			)
		).toEqual({
			contentOrder: ['blog', 'about'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['post-2']
						}
					],
					ungroupedItems: ['post-1', 'post-3']
				}
			}
		});
	});

	it('falls back to the manifest section when collection items are not loaded', () => {
		expect(
			createNavigationDraft(
				configs,
				{
					version: 1,
					content: {
						items: ['about', 'blog']
					},
					collections: {
						blog: {
							items: ['post-2', 'post-1', 'post-3'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['post-2']
								}
							]
						}
					}
				},
				{},
				rootConfig
			)
		).toEqual({
			contentOrder: ['about', 'blog'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['post-2']
						}
					],
					ungroupedItems: ['post-1', 'post-3']
				}
			}
		});
	});

	it('serializes grouped and ungrouped collection items back into the manifest shape', () => {
		expect(
			serializeNavigationDraft({
				contentOrder: ['blog', 'about'],
				collections: {
					blog: {
						groups: [
							{
								id: 'featured',
								label: 'Featured',
								items: ['post-3', 'post-2']
							}
						],
						ungroupedItems: ['post-1']
					}
				}
			})
		).toEqual({
			version: 1,
			content: {
				items: ['blog', 'about']
			},
			collections: {
				blog: {
					items: ['post-3', 'post-2', 'post-1'],
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['post-3', 'post-2']
						}
					]
				}
			}
		});
	});

	it('updates top-level order and collection zones immutably', () => {
		const draft = {
			contentOrder: ['about', 'blog'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['post-2']
						}
					],
					ungroupedItems: ['post-1', 'post-3']
				}
			}
		};

		const reordered = setNavigationDraftContentOrder(draft, ['blog', 'about']);
		const regrouped = setNavigationDraftCollectionGroupItems(reordered, 'blog', 'featured', [
			'post-3',
			'post-2'
		]);
		const movedOut = setNavigationDraftCollectionUngroupedItems(regrouped, 'blog', ['post-1']);

		expect(movedOut).toEqual({
			contentOrder: ['blog', 'about'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['post-3', 'post-2']
						}
					],
					ungroupedItems: ['post-1']
				}
			}
		});
		expect(draft.contentOrder).toEqual(['about', 'blog']);
		expect(draft.collections.blog.groups[0].items).toEqual(['post-2']);
		expect(draft.collections.blog.ungroupedItems).toEqual(['post-1', 'post-3']);
	});

	it('compares drafts based on their serialized manifest output', () => {
		expect(
			areNavigationDraftsEqual(
				{
					contentOrder: ['about'],
					collections: {
						blog: {
							groups: [],
							ungroupedItems: ['one']
						}
					}
				},
				{
					contentOrder: ['about'],
					collections: {
						blog: {
							groups: [],
							ungroupedItems: ['one']
						}
					}
				}
			)
		).toBe(true);
	});
});
