import { describe, expect, it } from 'vitest';
import {
	addContentConfigIdToSource,
	buildNavigationManifestFromRepository,
	getManualNavigationSetupState,
	getMissingContentConfigIds,
	parseNavigationManifest
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
		async writeTextFile(_path: string, _content: string, _options?: RepositoryWriteOptions) {},
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
						"items": ["second-post"],
						"groups": [
							{
								"id": "featured",
								"label": "Featured",
								"items": ["second-post"]
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
					items: ['second-post'],
					groups: [
						{
							id: 'featured',
							label: 'Featured',
							items: ['second-post']
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

	it('suggests ids only for configs that are still missing them', () => {
		expect(
			getMissingContentConfigIds([
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						id: 'about',
						label: 'About',
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

	it('adds a missing id to a content config without replacing an existing id', () => {
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
		).toContain('"id": "posts"');
	});

	it('builds an initial manifest from the current discovered order', async () => {
		const backend = createBackend({
			'src/content/posts.json': JSON.stringify([
				{ slug: 'hello-world', title: 'Hello world' },
				{ slug: 'second-post', title: 'Second post' }
			]),
			'src/content/about.json': JSON.stringify({
				title: 'About'
			})
		});

		expect(
			await buildNavigationManifestFromRepository(backend, [
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						id: 'about',
						label: 'About',
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
						id: 'posts',
						label: 'Posts',
						collection: true,
						idField: 'slug',
						content: {
							mode: 'file',
							path: 'src/content/posts.json'
						},
						blocks: []
					}
				}
			])
		).toEqual({
			version: 1,
			content: {
				items: ['about', 'posts']
			},
			collections: {
				posts: {
					items: ['hello-world', 'second-post']
				}
			}
		});
	});

	it('marks collection ordering as blocked when idField is missing', () => {
		expect(
			getManualNavigationSetupState(
				[
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							type: 'content',
							id: 'posts',
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
				}
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
