import { describe, expect, it } from 'vitest';
import {
	addContentConfigIdToSource,
	addRootManualSortingToSource,
	buildNavigationManifestFromRepository,
	detectCollectionGroupField,
	getManualNavigationSetupState,
	getMissingContentConfigIds,
	parseNavigationManifest,
	reconcileManualNavigationSetup,
	saveCollectionOrder
} from '$lib/features/content-management/navigation-manifest';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

function createBackend(files: Record<string, string>): RepositoryBackend {
	return {
		kind: 'local',
		cacheKey: 'local:test',
		label: 'Local test',
		supportsDraftBranches: false,
		async discoverConfigs() {
			return [];
		},
		async discoverBlockConfigs() {
			return [];
		},
		async readRootConfig() {
			return null;
		},
		async readTextFile(path: string, _options?: RepositoryReadOptions) {
			const value = files[path];
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}

			return value;
		},
		async writeTextFile(path: string, content: string, _options?: RepositoryWriteOptions) {
			files[path] = content;
		},
		async writeBinaryFile(
			_path: string,
			_content: Uint8Array,
			_options?: RepositoryWriteOptions
		) {},
		async deleteFile(_path: string, _options?: RepositoryWriteOptions) {},
		async listDirectory() {
			return [];
		},
		async fileExists(path: string) {
			return path in files;
		}
	};
}

describe('navigation manifest helpers', () => {
	it('parses the v1 JSON manifest schema', () => {
		expect(
			parseNavigationManifest(`{
				"version": 1,
				"content": {
					"items": ["about", "posts"]
				},
				"collections": {
					"posts": {
						"items": ["post-2"],
						"groups": [
							{
								"id": "featured",
								"label": "Featured",
								"items": ["post-2"]
							}
						]
					}
				}
			}`)
		).toEqual({
			version: 1,
			content: {
				items: ['about', 'posts']
			},
			collections: {
				posts: {
					items: ['post-2'],
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['post-2']
						}
					]
				}
			}
		});
	});

	it('parses collection groups without labels for id-fallback displays', () => {
		expect(
			parseNavigationManifest(`{
				"version": 1,
				"collections": {
					"projects": {
						"items": [],
						"groups": [
							{ "id": "archive", "items": [] }
						]
					}
				}
			}`)
		).toEqual({
			version: 1,
			collections: {
				projects: {
					items: [],
					groups: [{ id: 'archive', items: [] }]
				}
			}
		});
	});

	it('accepts richer materialized manifest entries by normalizing them to ids', () => {
		expect(
			parseNavigationManifest(`{
				"version": 1,
				"content": {
					"items": [{ "id": "about", "label": "About", "slug": "about" }]
				},
				"collections": {
					"projects": {
						"id": "projects",
						"label": "Projects",
						"slug": "projects",
						"items": [
							{ "id": "poster-design", "label": "Poster design", "slug": "poster-design" }
						]
					}
				}
			}`)
		).toEqual({
			version: 1,
			content: {
				items: ['about']
			},
			collections: {
				projects: {
					id: 'projects',
					label: 'Projects',
					slug: 'projects',
					items: ['poster-design']
				}
			}
		});
	});

	it('suggests ids only for configs that are still missing them', () => {
		expect(
			getMissingContentConfigIds([
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						_tentmanId: 'about',
						label: 'About',
						collection: false,
						content: {
							mode: 'file',
							path: 'src/content/about.json'
						},
						blocks: []
					}
				},
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						type: 'content',
						label: 'Posts',
						content: {
							mode: 'file',
							path: 'src/content/posts.json'
						},
						blocks: []
					}
				}
			])
		).toEqual([
			{
				path: 'content/posts.tentman.json',
				slug: 'posts',
				label: 'Posts',
				suggestedId: 'posts'
			}
		]);
	});

	it('adds a missing Tentman id to a content config', () => {
		expect(
			addContentConfigIdToSource(
				`{
					"type": "content",
					"label": "Posts",
					"content": {
						"mode": "file",
						"path": "src/content/posts.json"
					},
					"blocks": []
				}`,
				'posts'
			)
		).toContain('"_tentmanId": "posts"');
	});

	it('adds root manual sorting to the root config source', () => {
		expect(addRootManualSortingToSource('{"siteName":"Docs"}')).toContain('"sorting": "manual"');
	});

	it('builds an initial manifest from Tentman ids and manual sorting config', async () => {
		const backend = createBackend({
			'src/content/posts.json': JSON.stringify([
				{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world' },
				{ _tentmanId: 'post-2', slug: 'second-post', title: 'Second post' }
			]),
			'src/content/about.json': JSON.stringify({
				title: 'About'
			})
		});

		expect(
			await buildNavigationManifestFromRepository(
				backend,
				[
					{
						slug: 'about',
						path: 'content/about.tentman.json',
						config: {
							type: 'content',
							_tentmanId: 'about',
							label: 'About',
							collection: false,
							content: {
								mode: 'file',
								path: 'src/content/about.json'
							},
							blocks: []
						}
					},
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							type: 'content',
							_tentmanId: 'posts',
							label: 'Posts',
							collection: {
								sorting: 'manual',
								groups: [{ _tentmanId: 'featured', label: 'Featured', slug: 'featured' }]
							},
							idField: 'slug',
							content: {
								mode: 'file',
								path: 'src/content/posts.json'
							},
							blocks: []
						}
					}
				],
				{ content: { sorting: 'manual' } }
			)
		).toEqual({
			version: 1,
			content: {
				items: ['about', 'posts']
			},
			collections: {
				posts: {
					id: 'posts',
					label: 'Posts',
					slug: 'posts',
					items: ['post-1', 'post-2'],
					groups: [{ id: 'featured', label: 'Featured', slug: 'featured', items: [] }]
				}
			}
		});
	});

	it('rewrites legacy manifest references through stable ids when rebuilding', async () => {
		const backend = createBackend({
			'src/content/posts.json': JSON.stringify([
				{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world' },
				{ _tentmanId: 'post-2', slug: 'second-post', title: 'Second post' }
			]),
			'src/content/about.json': JSON.stringify({
				title: 'About'
			})
		});

		expect(
			await buildNavigationManifestFromRepository(
				backend,
				[
					{
						slug: 'about',
						path: 'content/about.tentman.json',
						config: {
							type: 'content',
							_tentmanId: 'page-about',
							id: 'about',
							label: 'About',
							collection: false,
							content: {
								mode: 'file',
								path: 'src/content/about.json'
							},
							blocks: []
						}
					},
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							type: 'content',
							_tentmanId: 'content-posts',
							id: 'posts',
							label: 'Posts',
							collection: {
								sorting: 'manual',
								groups: [{ _tentmanId: 'featured-group', label: 'Featured', slug: 'featured' }]
							},
							idField: 'slug',
							content: {
								mode: 'file',
								path: 'src/content/posts.json',
								itemsPath: '$'
							},
							blocks: []
						}
					}
				],
				{ content: { sorting: 'manual' } },
				{
					version: 1,
					content: {
						items: ['posts', 'about']
					},
					collections: {
						posts: {
							items: ['second-post', 'hello-world'],
							groups: [{ id: 'featured', label: 'Featured', items: ['hello-world'] }]
						}
					}
				}
			)
		).toEqual({
			version: 1,
			content: {
				items: ['content-posts', 'page-about']
			},
			collections: {
				'content-posts': {
					id: 'content-posts',
					label: 'Posts',
					slug: 'posts',
					configId: 'posts',
					items: ['post-2', 'post-1'],
					groups: [{ id: 'featured-group', label: 'Featured', slug: 'featured', items: ['post-1'] }]
				}
			}
		});
	});

	it('reconciles missing and duplicate ids and migrates manifest-backed groups into config', async () => {
		const files: Record<string, string> = {
			'content/posts.tentman.json': JSON.stringify({
				type: 'content',
				label: 'Posts',
				id: 'posts',
				collection: {
					sorting: 'manual'
				},
				idField: 'slug',
				content: {
					mode: 'file',
					path: 'src/content/posts.json',
					itemsPath: '$'
				},
				blocks: []
			}),
			'src/content/posts.json': JSON.stringify([
				{ slug: 'hello-world', title: 'Hello world' },
				{ _tentmanId: 'dup', slug: 'second-post', title: 'Second post' },
				{ _tentmanId: 'dup', slug: 'third-post', title: 'Third post' }
			])
		};
		const backend = createBackend(files);

		const manifest = await reconcileManualNavigationSetup(
			backend,
			[
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						type: 'content',
						id: 'posts',
						label: 'Posts',
						collection: {
							sorting: 'manual'
						},
						idField: 'slug',
						content: {
							mode: 'file',
							path: 'src/content/posts.json',
							itemsPath: '$'
						},
						blocks: []
					}
				}
			],
			{ content: { sorting: 'manual' } },
			{
				version: 1,
				content: {
					items: ['posts']
				},
				collections: {
					posts: {
						items: ['second-post', 'hello-world', 'dup'],
						groups: [{ id: 'featured', label: 'Featured', items: ['hello-world', 'dup'] }]
					}
				}
			},
			{
				message: 'Repair ids'
			}
		);

		expect(manifest).toEqual({
			version: 1,
			content: {
				items: ['posts']
			},
			collections: {
				posts: {
					id: 'posts',
					label: 'Posts',
					slug: 'posts',
					configId: 'posts',
					items: ['dup', 'hello-world', 'third-post'],
					groups: [
						{ id: 'featured', label: 'Featured', slug: 'featured', items: ['hello-world', 'dup'] }
					]
				}
			}
		});

		expect(files['content/posts.tentman.json']).toContain('"_tentmanId": "posts"');
		expect(files['content/posts.tentman.json']).toContain('"groups"');
		expect(files['src/content/posts.json']).toContain('"_tentmanId": "hello-world"');
		expect(files['src/content/posts.json']).toContain('"_tentmanId": "third-post"');
	});

	it('assigns ids to predeclared collection groups that are missing _tentmanId', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				label: 'Projects',
				_tentmanId: 'projects',
				collection: {
					sorting: 'manual',
					groups: [{ label: 'Identity', slug: 'identity' }]
				},
				idField: 'slug',
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: []
			}),
			'src/content/projects.json': JSON.stringify([])
		};
		const backend = createBackend(files);

		const manifest = await reconcileManualNavigationSetup(
			backend,
			[
				{
					slug: 'projects',
					path: 'content/projects.tentman.json',
					config: {
						type: 'content',
						_tentmanId: 'projects',
						label: 'Projects',
						collection: {
							sorting: 'manual',
							groups: [{ label: 'Identity', slug: 'identity' }]
						},
						idField: 'slug',
						content: {
							mode: 'file',
							path: 'src/content/projects.json',
							itemsPath: '$'
						},
						blocks: []
					}
				}
			],
			{ content: { sorting: 'manual' } },
			null
		);

		expect(manifest).toEqual({
			version: 1,
			content: {
				items: ['projects']
			},
			collections: {
				projects: {
					id: 'projects',
					label: 'Projects',
					slug: 'projects',
					items: [],
					groups: [{ id: 'identity', label: 'Identity', slug: 'identity', items: [] }]
				}
			}
		});

		expect(files['content/projects.tentman.json']).toContain('"_tentmanId": "identity"');
	});

	it('detects exactly one matching collection group field', () => {
		expect(
			detectCollectionGroupField({
				slug: 'projects',
				path: 'content/projects.tentman.json',
				config: {
					type: 'content',
					_tentmanId: 'projects',
					label: 'Projects',
					collection: { sorting: 'manual' },
					content: {
						mode: 'file',
						path: 'src/content/projects.json'
					},
					blocks: [
						{
							id: 'group',
							type: 'select',
							label: 'Group',
							options: {
								source: 'tentman.navigationGroups',
								collection: 'projects'
							}
						}
					]
				}
			})
		).toBe('group');
	});

	it('blocks ambiguous or missing collection group fields with useful errors', () => {
		const baseConfig = {
			slug: 'projects',
			path: 'content/projects.tentman.json',
			config: {
				type: 'content' as const,
				_tentmanId: 'projects',
				label: 'Projects',
				collection: { sorting: 'manual' as const },
				content: {
					mode: 'file' as const,
					path: 'src/content/projects.json'
				},
				blocks: []
			}
		};

		expect(() => detectCollectionGroupField(baseConfig)).toThrow(/no select field/);
		expect(() =>
			detectCollectionGroupField({
				...baseConfig,
				config: {
					...baseConfig.config,
					blocks: [
						{
							id: 'primaryGroup',
							type: 'select',
							options: {
								source: 'tentman.navigationGroups',
								collection: 'projects'
							}
						},
						{
							id: 'secondaryGroup',
							type: 'select',
							options: {
								source: 'tentman.navigationGroups',
								collection: 'projects'
							}
						}
					]
				}
			})
		).toThrow(/multiple select fields/);
	});

	it('saves collection group order, moved item group values, and manifest order together', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				_tentmanId: 'projects',
				label: 'Projects',
				collection: {
					sorting: 'manual',
					groups: [
						{ _tentmanId: 'identity', label: 'Identity', slug: 'identity' },
						{ _tentmanId: 'campaigns', label: 'Campaigns', slug: 'campaigns' }
					]
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: [
					{
						id: 'title',
						type: 'text',
						label: 'Title'
					},
					{
						id: 'group',
						type: 'select',
						label: 'Group',
						options: {
							source: 'tentman.navigationGroups',
							collection: 'projects'
						}
					}
				]
			}),
			'src/content/projects.json': JSON.stringify([
				{ _tentmanId: 'brand-system', title: 'Brand system', group: 'identity' },
				{ _tentmanId: 'launch', title: 'Launch', group: 'campaigns' },
				{ _tentmanId: 'archive', title: 'Archive' }
			])
		};
		const backend = createBackend(files);
		const manifest = await saveCollectionOrder(
			backend,
			{
				slug: 'projects',
				path: 'content/projects.tentman.json',
				config: {
					type: 'content',
					_tentmanId: 'projects',
					label: 'Projects',
					collection: {
						sorting: 'manual',
						groups: [
							{ _tentmanId: 'identity', label: 'Identity', slug: 'identity' },
							{ _tentmanId: 'campaigns', label: 'Campaigns', slug: 'campaigns' }
						]
					},
					content: {
						mode: 'file',
						path: 'src/content/projects.json',
						itemsPath: '$'
					},
					blocks: [
						{
							id: 'group',
							type: 'select',
							options: {
								source: 'tentman.navigationGroups',
								collection: 'projects'
							}
						}
					]
				}
			},
			{
				groups: [
					{ id: 'campaigns', label: 'Campaigns', items: ['brand-system', 'launch'] },
					{ id: 'identity', label: 'Identity', items: [] }
				],
				ungroupedItems: ['archive']
			},
			{
				version: 1,
				collections: {
					projects: {
						items: ['brand-system', 'launch', 'archive'],
						groups: [
							{ id: 'identity', label: 'Identity', items: ['brand-system'] },
							{ id: 'campaigns', label: 'Campaigns', items: ['launch'] }
						]
					}
				}
			}
		);

		expect(JSON.parse(files['content/projects.tentman.json']).collection.groups).toEqual([
			{ _tentmanId: 'campaigns', label: 'Campaigns', slug: 'campaigns' },
			{ _tentmanId: 'identity', label: 'Identity', slug: 'identity' }
		]);
		expect(JSON.parse(files['src/content/projects.json'])).toEqual([
			{ _tentmanId: 'brand-system', title: 'Brand system', group: 'campaigns' },
			{ _tentmanId: 'launch', title: 'Launch', group: 'campaigns' },
			{ _tentmanId: 'archive', title: 'Archive' }
		]);
		expect(manifest.collections?.projects).toEqual({
			items: ['brand-system', 'launch', 'archive'],
			groups: [
				{
					id: 'campaigns',
					label: 'Campaigns',
					slug: 'campaigns',
					items: ['brand-system', 'launch']
				},
				{ id: 'identity', label: 'Identity', slug: 'identity', items: [] }
			]
		});
		expect(JSON.parse(files['tentman/navigation-manifest.json'])).toEqual(manifest);
	});

	it('marks collection ordering as blocked when manual sorting is not enabled', () => {
		expect(
			getManualNavigationSetupState(
				[
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							type: 'content',
							_tentmanId: 'posts',
							label: 'Posts',
							collection: true,
							content: {
								mode: 'file',
								path: 'src/content/posts.json'
							},
							blocks: []
						}
					}
				],
				{
					path: 'tentman/navigation-manifest.json',
					exists: false,
					manifest: null,
					error: null
				},
				{ content: { sorting: 'manual' } }
			)
		).toMatchObject({
			status: 'partial',
			collections: [
				{
					slug: 'posts',
					canOrderItems: false,
					idField: null
				}
			]
		});
	});
});
