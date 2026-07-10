import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	clearCollectionNavigationCache,
	clearRepositorySnapshotCache,
	getCollectionNavigation,
	hydrateCollectionProjections,
	resolveCollectionItemDocument
} from './index';

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	}))
}));

function encodeBlob(value: string): string {
	return Buffer.from(value, 'utf-8').toString('base64');
}

function createBaseBackend(overrides: Partial<RepositoryBackend> = {}): RepositoryBackend {
	return {
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async () => ''),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false),
		...overrides
	};
}

function createGitHubBackend(files: Record<string, string>): GitHubRepositoryBackend {
	const shasByPath = new Map(Object.keys(files).map((path) => [path, `sha:${path}`]));
	const contentBySha = new Map(
		Object.entries(files).map(([path, content]) => [`sha:${path}`, content])
	);
	const octokit = {
		rest: {
			repos: {
				getBranch: vi.fn(async () => ({
					data: {
						commit: {
							sha: 'commit-main'
						}
					}
				}))
			},
			git: {
				getCommit: vi.fn(async () => ({
					data: {
						tree: {
							sha: 'tree-main'
						}
					}
				})),
				getTree: vi.fn(async () => ({
					data: {
						truncated: false,
						tree: [...shasByPath.entries()].map(([path, sha]) => ({
							path,
							sha,
							type: 'blob',
							size: contentBySha.get(sha)?.length
						}))
					}
				})),
				getBlob: vi.fn(async ({ file_sha }: { file_sha: string }) => ({
					data: {
						content: encodeBlob(contentBySha.get(file_sha) ?? '')
					}
				}))
			}
		}
	};

	return {
		...(createBaseBackend({
			readTextFile: vi.fn(async () => {
				throw new Error('legacy text reads should not run');
			}),
			listDirectory: vi.fn(async () => {
				throw new Error('legacy directory listing should not run');
			})
		}) as GitHubRepositoryBackend),
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit: octokit as never
	};
}

describe('collection navigation repository data layer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		clearCollectionNavigationCache();
	});

	it('builds directory-backed fallback navigation from GitHub tree entries without blob reads', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"siteName": "Acme Docs"
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"itemLabel": "title",
				"content": {
					"mode": "directory",
					"path": "../../src/content/posts",
					"template": "../../src/content/posts/_template.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "date", "type": "date", "label": "Date" }
				]
			}`,
			'src/content/posts/_template.md': `---\ntitle: ""\ndate: ""\n---\n`,
			'src/content/posts/second.md': `---\ntitle: "Second"\ndate: "2026-05-02"\n---\nSecond body`,
			'src/content/posts/first.md': `---\ntitle: "First"\ndate: "2026-05-01"\n---\nFirst body`
		});

		const navigation = await getCollectionNavigation({
			backend,
			slug: 'posts'
		});

		expect(navigation).toEqual({
			items: [
				{
					itemId: 'second',
					title: 'second',
					sortDate: null,
					sortValues: {},
					hydration: 'fallback',
					hrefItemId: 'second'
				},
				{
					itemId: 'first',
					title: 'first',
					sortDate: null,
					sortValues: {},
					hydration: 'fallback',
					hrefItemId: 'first'
				}
			],
			groups: []
		});
		expect(backend.listDirectory).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getBlob).not.toHaveBeenCalledWith(
			expect.objectContaining({ file_sha: 'sha:src/content/posts/second.md' })
		);
		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
	});

	it('hydrates directory-backed projection titles and state by requested blob SHA', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"statePresets": {
					"publishing": {
						"cases": [
							{ "value": "draft", "label": "Draft", "variant": "warning" },
							{ "value": "published", "label": "Published", "variant": "success" }
						]
					}
				}
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": {
					"state": {
						"blockId": "status",
						"preset": "publishing"
					}
				},
				"itemLabel": "title",
				"content": {
					"mode": "directory",
					"path": "../../src/content/posts",
					"template": "../../src/content/posts/_template.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "status", "type": "text", "label": "Status" }
				]
			}`,
			'src/content/posts/_template.md': `---\ntitle: ""\nstatus: draft\n---\n`,
			'src/content/posts/hello.md': `---\ntitle: "Hello"\nstatus: "published"\n---\nBody`
		});

		const result = await hydrateCollectionProjections({
			backend,
			slug: 'posts',
			blobShas: ['sha:src/content/posts/hello.md']
		});

		expect(result?.items[0]).toMatchObject({
			itemId: 'hello',
			title: 'Hello',
			hydration: 'hydrated',
			hrefItemId: 'hello',
			state: {
				value: 'published',
				label: 'Published',
				variant: 'success',
				icon: null,
				visibility: {
					navigation: true,
					header: true,
					card: true
				}
			}
		});
		expect(backend.readTextFile).not.toHaveBeenCalled();
	});

	it('builds file-backed collection navigation from the container blob SHA', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"statePresets": {
					"publishing": {
						"cases": [
							{ "value": "draft", "label": "Draft", "variant": "warning" },
							{ "value": "published", "label": "Published", "variant": "success" }
						]
					}
				}
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": {
					"state": {
						"blockId": "status",
						"preset": "publishing"
					}
				},
				"itemLabel": "title",
				"content": {
					"mode": "file",
					"path": "../../src/content/posts.json",
					"itemsPath": "$.posts"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "date", "type": "date", "label": "Date" },
					{ "id": "status", "type": "text", "label": "Status" }
				]
			}`,
			'src/content/posts.json': JSON.stringify({
				posts: [
					{
						_tentmanId: 'post-1',
						slug: 'first',
						title: 'First',
						date: '2026-05-01',
						status: 'published'
					},
					{
						_tentmanId: 'post-2',
						slug: 'second',
						title: 'Second',
						date: '2026-05-02',
						status: 'draft'
					}
				]
			})
		});

		const navigation = await getCollectionNavigation({
			backend,
			slug: 'posts'
		});

		expect(navigation).toEqual({
			items: [
				{
					itemId: 'post-1',
					title: 'First',
					sortDate: null,
					sortValues: {
						title: 'First'
					},
					hydration: 'hydrated',
					hrefItemId: 'post-1',
					state: {
						value: 'published',
						label: 'Published',
						variant: 'success',
						icon: null,
						visibility: {
							navigation: true,
							header: true,
							card: true
						}
					}
				},
				{
					itemId: 'post-2',
					title: 'Second',
					sortDate: null,
					sortValues: {
						title: 'Second'
					},
					hydration: 'hydrated',
					hrefItemId: 'post-2',
					state: {
						value: 'draft',
						label: 'Draft',
						variant: 'warning',
						icon: null,
						visibility: {
							navigation: true,
							header: true,
							card: true
						}
					}
				}
			],
			groups: []
		});
		expect(backend.listDirectory).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getBlob).toHaveBeenCalledWith(
			expect.objectContaining({ file_sha: 'sha:src/content/posts.json' })
		);
	});

	it('resolves a directory-backed item with path and blob identity', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs"
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"itemLabel": "title",
				"content": {
					"mode": "directory",
					"path": "../../src/content/posts",
					"template": "../../src/content/posts/_template.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" }
				]
			}`,
			'src/content/posts/_template.md': `---\ntitle: ""\n---\n`,
			'src/content/posts/hello-world.md': `---\ntitle: "Hello world"\n---\nBody`
		});

		const result = await resolveCollectionItemDocument({
			backend,
			slug: 'posts',
			itemId: 'hello-world'
		});

		expect(result).toMatchObject({
			config: {
				slug: 'posts'
			},
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'sha:src/content/posts/hello-world.md'
			},
			content: {
				_filename: 'hello-world.md',
				title: 'Hello world',
				body: 'Body'
			}
		});
	});

	it('resolves a file-backed item with container path, blob, and item index', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs"
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"itemLabel": "title",
				"idField": "slug",
				"content": {
					"mode": "file",
					"path": "../../src/content/posts.json",
					"itemsPath": "$.posts"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" }
				]
			}`,
			'src/content/posts.json': JSON.stringify({
				posts: [
					{
						_tentmanId: 'post-1',
						slug: 'first',
						title: 'First'
					},
					{
						_tentmanId: 'post-2',
						slug: 'second',
						title: 'Second'
					}
				]
			})
		});

		const result = await resolveCollectionItemDocument({
			backend,
			slug: 'posts',
			itemId: 'second'
		});

		expect(result).toMatchObject({
			indexItem: {
				itemId: 'post-2',
				route: 'second',
				path: 'src/content/posts.json',
				filename: 'posts.json',
				blobSha: 'sha:src/content/posts.json',
				index: 1
			},
			content: {
				_tentmanId: 'post-2',
				slug: 'second',
				title: 'Second'
			}
		});
		expect(backend.readTextFile).not.toHaveBeenCalled();
	});
});
