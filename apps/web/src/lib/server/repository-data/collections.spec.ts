import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	clearCollectionNavigationCache,
	clearRepositorySnapshotCache,
	getCollectionNavigation
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

	it('builds directory-backed navigation from GitHub tree entries and blob projections', async () => {
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
					title: 'Second',
					sortDate: new Date('2026-05-02').getTime()
				},
				{
					itemId: 'first',
					title: 'First',
					sortDate: new Date('2026-05-01').getTime()
				}
			],
			groups: []
		});
		expect(backend.listDirectory).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
	});

	it('preserves collection item state from projection-backed navigation', async () => {
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

		const navigation = await getCollectionNavigation({
			backend,
			slug: 'posts'
		});

		expect(navigation?.items[0]).toMatchObject({
			itemId: 'hello',
			title: 'Hello',
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
					sortDate: new Date('2026-05-01').getTime(),
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
					sortDate: new Date('2026-05-02').getTime(),
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
});
