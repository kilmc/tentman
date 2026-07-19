import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	getNavigationReferenceIds,
	normalizeNavigationManifest,
	type NavigationManifestCollectionInput,
	type NavigationManifestInput
} from '@tentman/core/navigation-manifest';
import {
	addContentConfigIdToSource,
	addRootManualSortingToSource,
	buildNavigationManifestFromRepository,
	clearNavigationManifestStateCache,
	detectCollectionGroupField,
	getManualNavigationSetupState,
	manageCollectionGroups,
	getMissingContentConfigIds,
	reconcileManualNavigationSetup,
	saveCollectionOrder,
	syncCollectionItemGroupSelection,
	writeNavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

function canonicalManifest(manifest: NavigationManifestInput) {
	return normalizeNavigationManifest(manifest);
}

function canonicalCollection(collection: NavigationManifestCollectionInput) {
	return normalizeNavigationManifest({
		version: 1,
		collections: {
			collection
		}
	}).collections?.collection;
}

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
				const error = new Error(`Missing file: ${path}`) as Error & { status?: number };
				error.status = 404;
				throw error;
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

function readWrittenManifest(files: Record<string, string>): NavigationManifestInput {
	return JSON.parse(files['tentman/navigation-manifest.json'] ?? 'null') as NavigationManifestInput;
}

describe('navigation manifest helpers', () => {
	beforeEach(() => {
		clearNavigationManifestStateCache();
	});

	afterEach(() => {
		clearNavigationManifestStateCache();
	});

	it('writes shorthand manifest references as canonical objects', async () => {
		const files: Record<string, string> = {};
		const backend = createBackend(files);

		await writeNavigationManifest(backend, {
			version: 1,
			content: {
				items: ['about', { id: 'posts', label: 'Posts' }]
			},
			collections: {
				posts: {
					items: ['hello-world'],
					groups: [{ id: 'featured', label: 'Featured', items: ['hello-world'] }]
				}
			}
		});

		expect(readWrittenManifest(files)).toEqual({
			version: 1,
			content: {
				items: [{ id: 'about' }, { id: 'posts', label: 'Posts' }]
			},
			collections: {
				posts: {
					items: [{ id: 'hello-world' }],
					groups: [{ id: 'featured', label: 'Featured', items: [{ id: 'hello-world' }] }]
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
		expect(JSON.parse(addRootManualSortingToSource('{"siteName":"Docs"}'))).toEqual({
			siteName: 'Docs',
			content: {
				sorting: 'manual'
			}
		});
	});

	it('syncs edited tentmanGroup selection into the navigation manifest', async () => {
		const backend = createBackend({
			'tentman/navigation-manifest.json': JSON.stringify({
				version: 1,
				collections: {
					projects: {
						items: ['berlin-neukoelln-kiezkulisse', 'other-project'],
						groups: [
							{ id: 'illustration', label: 'Illustration', items: ['other-project'] },
							{ id: 'study-projects', label: 'Study Projects', items: [] }
						]
					}
				}
			}),
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				label: 'Projects',
				_tentmanId: 'projects',
				collection: {
					ordering: true,
					groups: [
						{ _tentmanId: 'illustration', label: 'Illustration', value: 'illustration' },
						{ _tentmanId: 'study-projects', label: 'Study Projects', value: 'study-projects' }
					]
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: [
					{
						id: 'tentmanGroup',
						type: 'tentmanGroup',
						label: 'Group',
						collection: 'projects'
					}
				]
			})
		});

		const manifest = await syncCollectionItemGroupSelection(
			backend,
			{
				slug: 'projects',
				path: 'content/projects.tentman.json',
				config: {
					type: 'content',
					label: 'Projects',
					_tentmanId: 'projects',
					collection: {
						ordering: true,
						groups: [
							{ _tentmanId: 'illustration', label: 'Illustration', value: 'illustration' },
							{
								_tentmanId: 'study-projects',
								label: 'Study Projects',
								value: 'study-projects'
							}
						]
					},
					content: {
						mode: 'file',
						path: 'src/content/projects.json',
						itemsPath: '$'
					},
					blocks: [
						{
							id: 'tentmanGroup',
							type: 'tentmanGroup',
							label: 'Group',
							collection: 'projects'
						}
					]
				}
			},
			{
				_tentmanId: 'berlin-neukoelln-kiezkulisse',
				_tentmanGroupId: 'study-projects'
			}
		);

		expect(manifest?.collections?.projects?.groups).toEqual([
			{
				id: 'illustration',
				label: 'Illustration',
				value: 'illustration',
				items: [{ id: 'other-project' }]
			},
			{
				id: 'study-projects',
				label: 'Study Projects',
				value: 'study-projects',
				items: [{ id: 'berlin-neukoelln-kiezkulisse' }]
			}
		]);
	});

	it('preserves item order when syncing a save that does not change group membership', async () => {
		const backend = createBackend({
			'tentman/navigation-manifest.json': JSON.stringify({
				version: 1,
				collections: {
					projects: {
						items: ['first-project', 'edited-project', 'third-project'],
						groups: [
							{
								id: 'illustration',
								label: 'Illustration',
								value: 'illustration',
								items: ['first-project', 'edited-project', 'third-project']
							}
						]
					}
				}
			}),
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				label: 'Projects',
				_tentmanId: 'projects',
				collection: {
					ordering: true,
					groups: [{ _tentmanId: 'illustration', label: 'Illustration', value: 'illustration' }]
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: [{ id: 'group', type: 'tentmanGroup', label: 'Group', collection: 'projects' }]
			})
		});
		const writeTextFile = vi.spyOn(backend, 'writeTextFile');

		const manifest = await syncCollectionItemGroupSelection(
			backend,
			{
				slug: 'projects',
				path: 'content/projects.tentman.json',
				config: {
					type: 'content',
					label: 'Projects',
					_tentmanId: 'projects',
					collection: {
						ordering: true,
						groups: [{ _tentmanId: 'illustration', label: 'Illustration', value: 'illustration' }]
					},
					content: {
						mode: 'file',
						path: 'src/content/projects.json',
						itemsPath: '$'
					},
					blocks: [
						{
							id: 'tentmanGroup',
							type: 'tentmanGroup',
							label: 'Group',
							collection: 'projects'
						}
					]
				}
			},
			{
				_tentmanId: 'edited-project',
				_tentmanGroupId: 'illustration',
				published: true
			}
		);

		expect(getNavigationReferenceIds(manifest?.collections?.projects?.items)).toEqual([
			'first-project',
			'edited-project',
			'third-project'
		]);
		expect(manifest?.collections?.projects?.groups).toEqual(
			canonicalCollection({
				items: ['first-project', 'edited-project', 'third-project'],
				groups: [
					{
						id: 'illustration',
						label: 'Illustration',
						value: 'illustration',
						items: ['first-project', 'edited-project', 'third-project']
					}
				]
			})?.groups
		);
		expect(writeTextFile).not.toHaveBeenCalled();
	});

	it('builds an initial manifest from Tentman ids and manual sorting config', async () => {
		const files: Record<string, string> = {
			'src/content/posts.json': JSON.stringify([
				{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world' },
				{ _tentmanId: 'post-2', slug: 'second-post', title: 'Second post' }
			]),
			'src/content/about.json': JSON.stringify({
				title: 'About'
			})
		};
		const backend = createBackend(files);

		const manifest = await buildNavigationManifestFromRepository(
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
							ordering: true,
							groups: [{ _tentmanId: 'featured', label: 'Featured', value: 'featured' }]
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
		);

		expect(manifest).toEqual(
			canonicalManifest({
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
						groups: [{ id: 'featured', label: 'Featured', value: 'featured', items: [] }]
					}
				}
			})
		);

		await writeNavigationManifest(backend, manifest);

		expect(readWrittenManifest(files)).toEqual({
			version: 1,
			content: {
				items: [{ id: 'about' }, { id: 'posts' }]
			},
			collections: {
				posts: {
					id: 'posts',
					label: 'Posts',
					slug: 'posts',
					items: [{ id: 'post-1' }, { id: 'post-2' }],
					groups: [{ id: 'featured', label: 'Featured', value: 'featured', items: [] }]
				}
			}
		});
	});

	it('rewrites legacy manifest references through stable ids when rebuilding', async () => {
		const files: Record<string, string> = {
			'src/content/posts.json': JSON.stringify([
				{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world' },
				{ _tentmanId: 'post-2', slug: 'second-post', title: 'Second post' }
			]),
			'src/content/about.json': JSON.stringify({
				title: 'About'
			})
		};
		const backend = createBackend(files);

		const manifest = await buildNavigationManifestFromRepository(
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
							ordering: true,
							groups: [{ _tentmanId: 'featured-group', label: 'Featured', value: 'featured' }]
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
			canonicalManifest({
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
			})
		);

		expect(manifest).toEqual(
			canonicalManifest({
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
						groups: [
							{ id: 'featured-group', label: 'Featured', value: 'featured', items: ['post-1'] }
						]
					}
				}
			})
		);

		await writeNavigationManifest(backend, manifest);

		expect(readWrittenManifest(files)).toEqual({
			version: 1,
			content: {
				items: [{ id: 'content-posts' }, { id: 'page-about' }]
			},
			collections: {
				'content-posts': {
					id: 'content-posts',
					label: 'Posts',
					slug: 'posts',
					configId: 'posts',
					items: [{ id: 'post-2' }, { id: 'post-1' }],
					groups: [
						{
							id: 'featured-group',
							label: 'Featured',
							value: 'featured',
							items: [{ id: 'post-1' }]
						}
					]
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
					ordering: true
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
							ordering: true
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
			canonicalManifest({
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
			}),
			{
				message: 'Repair ids'
			}
		);

		expect(manifest).toEqual(
			canonicalManifest({
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
							{
								id: 'featured',
								label: 'Featured',
								value: 'featured',
								items: ['hello-world', 'dup']
							}
						]
					}
				}
			})
		);

		expect(files['content/posts.tentman.json']).toContain('"_tentmanId": "posts"');
		expect(files['content/posts.tentman.json']).toContain('"groups"');
		expect(files['src/content/posts.json']).toContain('"_tentmanId": "hello-world"');
		expect(files['src/content/posts.json']).toContain('"_tentmanId": "third-post"');

		await writeNavigationManifest(backend, manifest);

		expect(readWrittenManifest(files)).toEqual({
			version: 1,
			content: {
				items: [{ id: 'posts' }]
			},
			collections: {
				posts: {
					id: 'posts',
					label: 'Posts',
					slug: 'posts',
					configId: 'posts',
					items: [{ id: 'dup' }, { id: 'hello-world' }, { id: 'third-post' }],
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							value: 'featured',
							items: [{ id: 'hello-world' }, { id: 'dup' }]
						}
					]
				}
			}
		});
	});

	it('assigns ids to predeclared collection groups that are missing _tentmanId', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				label: 'Projects',
				_tentmanId: 'projects',
				collection: {
					ordering: true,
					groups: [{ label: 'Identity', value: 'identity' }]
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
							ordering: true,
							groups: [{ label: 'Identity', value: 'identity' }]
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

		expect(manifest).toEqual(
			canonicalManifest({
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
						groups: [{ id: 'identity', label: 'Identity', value: 'identity', items: [] }]
					}
				}
			})
		);

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
					collection: { ordering: true },
					content: {
						mode: 'file',
						path: 'src/content/projects.json'
					},
					blocks: [
						{
							id: 'tentmanGroup',
							type: 'tentmanGroup',
							label: 'Group',
							collection: 'projects'
						}
					]
				}
			})
		).toBe('_tentmanGroupId');
	});

	it('blocks ambiguous or missing collection group fields with useful errors', () => {
		const baseConfig = {
			slug: 'projects',
			path: 'content/projects.tentman.json',
			config: {
				type: 'content' as const,
				_tentmanId: 'projects',
				label: 'Projects',
				collection: { ordering: true as const },
				content: {
					mode: 'file' as const,
					path: 'src/content/projects.json'
				},
				blocks: []
			}
		};

		expect(() => detectCollectionGroupField(baseConfig)).toThrow(/no tentmanGroup block/);
		expect(() =>
			detectCollectionGroupField({
				...baseConfig,
				config: {
					...baseConfig.config,
					blocks: [
						{
							id: 'tentmanGroup',
							type: 'tentmanGroup',
							collection: 'projects'
						},
						{
							id: 'tentmanGroup',
							type: 'tentmanGroup',
							collection: 'projects'
						}
					]
				}
			})
		).toThrow(/multiple tentmanGroup blocks/);
	});

	it('saves collection group order, moved item group values, and manifest order together', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				_tentmanId: 'projects',
				label: 'Projects',
				collection: {
					ordering: true,
					groups: [
						{ _tentmanId: 'identity', label: 'Identity', value: 'identity' },
						{ _tentmanId: 'campaigns', label: 'Campaigns', value: 'campaigns' }
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
						id: 'tentmanGroup',
						type: 'tentmanGroup',
						label: 'Group',
						collection: 'projects'
					}
				]
			}),
			'src/content/projects.json': JSON.stringify([
				{
					_tentmanId: 'brand-system',
					title: 'Brand system',
					group: 'identity',
					_tentmanGroupId: 'identity'
				},
				{
					_tentmanId: 'launch',
					title: 'Launch',
					group: 'campaigns',
					_tentmanGroupId: 'campaigns'
				},
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
						ordering: true,
						groups: [
							{ _tentmanId: 'identity', label: 'Identity', value: 'identity' },
							{ _tentmanId: 'campaigns', label: 'Campaigns', value: 'campaigns' }
						]
					},
					content: {
						mode: 'file',
						path: 'src/content/projects.json',
						itemsPath: '$'
					},
					blocks: [
						{
							id: 'tentmanGroup',
							type: 'tentmanGroup',
							collection: 'projects'
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
			canonicalManifest({
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
			})
		);

		expect(JSON.parse(files['content/projects.tentman.json']).collection.groups).toEqual([
			{ _tentmanId: 'campaigns', label: 'Campaigns', value: 'campaigns' },
			{ _tentmanId: 'identity', label: 'Identity', value: 'identity' }
		]);
		expect(JSON.parse(files['src/content/projects.json'])).toEqual([
			{
				_tentmanId: 'brand-system',
				title: 'Brand system',
				group: 'identity',
				_tentmanGroupId: 'campaigns'
			},
			{
				_tentmanId: 'launch',
				title: 'Launch',
				group: 'campaigns',
				_tentmanGroupId: 'campaigns'
			},
			{ _tentmanId: 'archive', title: 'Archive' }
		]);
		expect(manifest.collections?.projects).toEqual(
			canonicalCollection({
				items: ['brand-system', 'launch', 'archive'],
				groups: [
					{
						id: 'campaigns',
						label: 'Campaigns',
						value: 'campaigns',
						items: ['brand-system', 'launch']
					},
					{ id: 'identity', label: 'Identity', value: 'identity', items: [] }
				]
			})
		);
		expect(readWrittenManifest(files)).toEqual({
			version: 1,
			collections: {
				projects: {
					items: [{ id: 'brand-system' }, { id: 'launch' }, { id: 'archive' }],
					groups: [
						{
							id: 'campaigns',
							label: 'Campaigns',
							value: 'campaigns',
							items: [{ id: 'brand-system' }, { id: 'launch' }]
						},
						{ id: 'identity', label: 'Identity', value: 'identity', items: [] }
					]
				}
			}
		});
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

	it('creates a managed collection group using one stable id in config and manifest', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				_tentmanId: 'projects',
				label: 'Projects',
				collection: {
					groupManagement: true,
					groups: []
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: []
			}),
			'src/content/projects.json': JSON.stringify([{ _tentmanId: 'brand-system', title: 'Brand' }])
		};
		const backend = createBackend(files);
		const config = {
			slug: 'projects',
			path: 'content/projects.tentman.json',
			config: JSON.parse(files['content/projects.tentman.json'])
		};

		const manifest = await manageCollectionGroups(
			backend,
			config,
			{ action: 'create', id: 'identity', label: 'Identity', value: 'identity' },
			null
		);

		expect(JSON.parse(files['content/projects.tentman.json']).collection.groups).toEqual([
			{ _tentmanId: 'identity', label: 'Identity', value: 'identity' }
		]);
		expect(manifest.collections?.projects.groups).toEqual(
			canonicalCollection({
				items: [],
				groups: [{ id: 'identity', label: 'Identity', value: 'identity', items: [] }]
			})?.groups
		);
		expect(readWrittenManifest(files).collections?.projects?.groups).toEqual([
			{ id: 'identity', label: 'Identity', value: 'identity', items: [] }
		]);
	});

	it('preserves materialized item reference metadata when editing managed groups', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				_tentmanId: 'projects',
				label: 'Projects',
				collection: {
					groupManagement: true,
					groups: [{ _tentmanId: 'identity', label: 'Identity', value: 'identity' }]
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: []
			}),
			'src/content/projects.json': JSON.stringify([{ _tentmanId: 'brand-system', title: 'Brand' }])
		};
		const backend = createBackend(files);
		const config = {
			slug: 'projects',
			path: 'content/projects.tentman.json',
			config: JSON.parse(files['content/projects.tentman.json'])
		};
		const materializedReference = {
			id: 'brand-system',
			label: 'Brand system',
			slug: 'brand-system',
			href: '/projects/brand-system'
		};

		const manifest = await manageCollectionGroups(
			backend,
			config,
			{ action: 'edit', groupId: 'identity', label: 'Brand Identity', value: 'brand-identity' },
			canonicalManifest({
				version: 1,
				collections: {
					projects: {
						items: [materializedReference],
						groups: [
							{
								id: 'identity',
								label: 'Identity',
								value: 'identity',
								items: [materializedReference]
							}
						]
					}
				}
			})
		);

		expect(manifest.collections?.projects.items).toEqual([materializedReference]);
		expect(manifest.collections?.projects.groups?.[0]?.items).toEqual([materializedReference]);
		expect(readWrittenManifest(files).collections?.projects?.groups?.[0]?.items).toEqual([
			materializedReference
		]);
	});

	it('deletes a managed group and appends its items to ungrouped', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				_tentmanId: 'projects',
				label: 'Projects',
				collection: {
					groupManagement: true,
					groups: [
						{ _tentmanId: 'identity', label: 'Identity', value: 'identity' },
						{ _tentmanId: 'campaigns', label: 'Campaigns', value: 'campaigns' }
					]
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: []
			}),
			'src/content/projects.json': JSON.stringify([
				{ _tentmanId: 'brand-system', title: 'Brand', _tentmanGroupId: 'identity' },
				{ _tentmanId: 'archive', title: 'Archive' },
				{ _tentmanId: 'launch', title: 'Launch', _tentmanGroupId: 'campaigns' }
			])
		};
		const backend = createBackend(files);
		const config = {
			slug: 'projects',
			path: 'content/projects.tentman.json',
			config: JSON.parse(files['content/projects.tentman.json'])
		};

		const manifest = await manageCollectionGroups(
			backend,
			config,
			{ action: 'delete', groupId: 'identity' },
			canonicalManifest({
				version: 1,
				collections: {
					projects: {
						items: ['brand-system', 'launch', 'archive'],
						groups: [
							{ id: 'identity', label: 'Identity', value: 'identity', items: ['brand-system'] },
							{ id: 'campaigns', label: 'Campaigns', value: 'campaigns', items: ['launch'] }
						]
					}
				}
			})
		);

		expect(manifest.collections?.projects).toEqual(
			canonicalCollection({
				id: 'projects',
				label: 'Projects',
				slug: 'projects',
				items: ['launch', 'archive', 'brand-system'],
				groups: [{ id: 'campaigns', label: 'Campaigns', value: 'campaigns', items: ['launch'] }]
			})
		);
		expect(readWrittenManifest(files).collections?.projects).toEqual({
			id: 'projects',
			label: 'Projects',
			slug: 'projects',
			items: [{ id: 'launch' }, { id: 'archive' }, { id: 'brand-system' }],
			groups: [
				{ id: 'campaigns', label: 'Campaigns', value: 'campaigns', items: [{ id: 'launch' }] }
			]
		});
		expect(JSON.parse(files['src/content/projects.json'])[0]).not.toHaveProperty('_tentmanGroupId');
	});

	it('merges a managed source group into a target group', async () => {
		const files: Record<string, string> = {
			'content/projects.tentman.json': JSON.stringify({
				type: 'content',
				_tentmanId: 'projects',
				label: 'Projects',
				collection: {
					groupManagement: true,
					groups: [
						{ _tentmanId: 'identity', label: 'Identity', value: 'identity' },
						{ _tentmanId: 'campaigns', label: 'Campaigns', value: 'campaigns' }
					]
				},
				content: {
					mode: 'file',
					path: 'src/content/projects.json',
					itemsPath: '$'
				},
				blocks: []
			}),
			'src/content/projects.json': JSON.stringify([
				{ _tentmanId: 'brand-system', title: 'Brand', _tentmanGroupId: 'identity' },
				{ _tentmanId: 'launch', title: 'Launch', _tentmanGroupId: 'campaigns' }
			])
		};
		const backend = createBackend(files);
		const config = {
			slug: 'projects',
			path: 'content/projects.tentman.json',
			config: JSON.parse(files['content/projects.tentman.json'])
		};

		const manifest = await manageCollectionGroups(
			backend,
			config,
			{ action: 'merge', sourceGroupId: 'identity', targetGroupId: 'campaigns' },
			canonicalManifest({
				version: 1,
				collections: {
					projects: {
						items: ['launch', 'brand-system'],
						groups: [
							{ id: 'campaigns', label: 'Campaigns', value: 'campaigns', items: ['launch'] },
							{ id: 'identity', label: 'Identity', value: 'identity', items: ['brand-system'] }
						]
					}
				}
			})
		);

		expect(manifest.collections?.projects.groups).toEqual(
			canonicalCollection({
				items: ['launch', 'brand-system'],
				groups: [
					{
						id: 'campaigns',
						label: 'Campaigns',
						value: 'campaigns',
						items: ['launch', 'brand-system']
					}
				]
			})?.groups
		);
		expect(readWrittenManifest(files).collections?.projects).toEqual({
			id: 'projects',
			label: 'Projects',
			slug: 'projects',
			items: [{ id: 'launch' }, { id: 'brand-system' }],
			groups: [
				{
					id: 'campaigns',
					label: 'Campaigns',
					value: 'campaigns',
					items: [{ id: 'launch' }, { id: 'brand-system' }]
				}
			]
		});
		expect(JSON.parse(files['src/content/projects.json'])[0]._tentmanGroupId).toBe('campaigns');
	});
});
