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
			id: 'about',
			label: 'About Page',
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
			id: 'blog',
			label: 'Blog Posts',
			collection: true,
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
							items: ['second-post', 'hello-world'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['second-post']
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
								items: [{ itemId: 'second-post', title: 'Second post' }]
							}
						],
						items: [
							{ itemId: 'hello-world', title: 'Hello world' },
							{ itemId: 'third-post', title: 'Third post' }
						]
					}
				}
			)
		).toEqual({
			contentOrder: ['blog', 'about'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['second-post']
						}
					],
					ungroupedItems: ['hello-world', 'third-post']
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
							items: ['second-post', 'hello-world', 'third-post'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['second-post']
								}
							]
						}
					}
				},
				{}
			)
		).toEqual({
			contentOrder: ['about', 'blog'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['second-post']
						}
					],
					ungroupedItems: ['hello-world', 'third-post']
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
								items: ['third-post', 'second-post']
							}
						],
						ungroupedItems: ['hello-world']
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
					items: ['third-post', 'second-post', 'hello-world'],
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['third-post', 'second-post']
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
							items: ['second-post']
						}
					],
					ungroupedItems: ['hello-world', 'third-post']
				}
			}
		};

		const reordered = setNavigationDraftContentOrder(draft, ['blog', 'about']);
		const regrouped = setNavigationDraftCollectionGroupItems(reordered, 'blog', 'featured', [
			'third-post',
			'second-post'
		]);
		const movedOut = setNavigationDraftCollectionUngroupedItems(regrouped, 'blog', ['hello-world']);

		expect(movedOut).toEqual({
			contentOrder: ['blog', 'about'],
			collections: {
				blog: {
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['third-post', 'second-post']
						}
					],
					ungroupedItems: ['hello-world']
				}
			}
		});
		expect(draft.contentOrder).toEqual(['about', 'blog']);
		expect(draft.collections.blog.groups[0].items).toEqual(['second-post']);
		expect(draft.collections.blog.ungroupedItems).toEqual(['hello-world', 'third-post']);
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
