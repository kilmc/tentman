import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repo-config-bootstrap', () => ({
	loadSelectedGitHubRepoBootstrapContext: vi.fn()
}));

import { GET } from '../../routes/api/repo/collection-items/+server';
import { getCachedContent } from '$lib/stores/content-cache';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import {
	clearCollectionNavigationCache,
	clearRepositorySnapshotCache
} from '$lib/server/repository-data';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

const collectionConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		label: 'Posts',
		collection: true,
		content: {
			mode: 'directory'
		},
		blocks: [
			{
				id: 'title',
				type: 'text'
			}
		]
	}
} as const;

function createCookies() {
	return {
		delete: vi.fn()
	};
}

function encodeBlob(value: string): string {
	return Buffer.from(value, 'utf-8').toString('base64');
}

function createGitHubBackend(files: Record<string, string>) {
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
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async (path: string) => {
			if (path === 'tentman/navigation-manifest.json') {
				throw { status: 404 };
			}
			throw new Error('legacy text reads should not run');
		}),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => {
			throw new Error('legacy directory listing should not run');
		}),
		fileExists: vi.fn(async () => false)
	};
}

function createBootstrapContext(
	configs: unknown[],
	backend: unknown = { cacheKey: 'github:acme/docs' }
) {
	return {
		backend,
		configs,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		rootConfig: null
	} as const;
}

describe('GET /api/repo/collection-items', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		clearCollectionNavigationCache();
	});

	it('returns collection navigation items for the requested slug', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([collectionConfig]) as never
		);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'hello-world',
					title: 'Hello world',
					sortDate: null
				}
			],
			groups: []
		});
	});

	it('returns slug-based items when manual sorting is not enabled and Tentman ids are missing', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([
				{
					...collectionConfig,
					config: {
						...collectionConfig.config,
						collection: true,
						blocks: [
							...collectionConfig.config.blocks,
							{
								id: 'date',
								type: 'date'
							}
						]
					}
				}
			]) as never
		);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'latest-news.md',
				title: 'Latest news',
				date: '2026-04-03'
			}
		]);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'latest-news',
					title: 'Latest news',
					sortDate: new Date('2026-04-03').getTime()
				}
			],
			groups: []
		});
	});

	it('returns explicit item labels from supported schema fields', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([
				{
					...collectionConfig,
					config: {
						...collectionConfig.config,
						blocks: [
							{
								id: 'publishedOn',
								type: 'date',
								label: 'Published on',
								isItemLabel: true,
								itemLabelFormat: {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								}
							},
							{
								id: 'title',
								type: 'text'
							}
						]
					}
				}
			]) as never
		);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'latest-news.md',
				title: 'Latest news',
				publishedOn: '2026-04-03'
			}
		]);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'latest-news',
					title: 'Apr 3, 2026',
					sortDate: new Date('2026-04-03').getTime()
				}
			],
			groups: []
		});
	});

	it('returns directory-backed GitHub collection navigation without loading full content', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"siteName": "Acme Docs"
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"idField": "slug",
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
			'src/content/posts/hello-world.md': `---\ntitle: "Hello world"\ndate: "2026-04-03"\n---\nFull body`,
			'src/content/posts/second.md': `---\ntitle: "Second"\ndate: "2026-04-04"\n---\nSecond body`
		});

		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext(
				[
					{
						...collectionConfig,
						path: 'tentman/configs/posts.tentman.json',
						config: {
							...collectionConfig.config,
							content: {
								mode: 'directory',
								path: '../../src/content/posts',
								template: '../../src/content/posts/_template.md'
							},
							blocks: [
								{ id: 'title', type: 'text' },
								{ id: 'date', type: 'date' }
							]
						}
					}
				],
				backend
			) as never
		);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
			locals: {
				selectedRepo: {
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'hello-world',
					title: 'hello world',
					sortDate: null,
					hydration: 'fallback',
					hrefItemId: 'hello-world'
				},
				{
					itemId: 'second',
					title: 'second',
					sortDate: null,
					hydration: 'fallback',
					hrefItemId: 'second'
				}
			],
			groups: []
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(backend.listDirectory).not.toHaveBeenCalled();
	});

	it('returns file-backed GitHub collection navigation without loading full content', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"siteName": "Acme Docs"
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"idField": "slug",
				"itemLabel": "title",
				"content": {
					"mode": "file",
					"path": "../../src/content/posts.json",
					"itemsPath": "$.posts"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "slug", "type": "text", "label": "Slug" },
					{ "id": "date", "type": "date", "label": "Date" }
				]
			}`,
			'src/content/posts.json': JSON.stringify({
				posts: [
					{
						slug: 'hello-world',
						title: 'Hello world',
						date: '2026-04-03'
					},
					{
						slug: 'second',
						title: 'Second',
						date: '2026-04-04'
					}
				]
			})
		});

		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext(
				[
					{
						...collectionConfig,
						path: 'tentman/configs/posts.tentman.json',
						config: {
							...collectionConfig.config,
							content: {
								mode: 'file',
								path: '../../src/content/posts.json',
								itemsPath: '$.posts'
							},
							idField: 'slug',
							blocks: [
								{ id: 'title', type: 'text' },
								{ id: 'slug', type: 'text' },
								{ id: 'date', type: 'date' }
							]
						}
					}
				],
				backend
			) as never
		);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
			locals: {
				selectedRepo: {
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'hello-world',
					title: 'Hello world',
					sortDate: new Date('2026-04-03').getTime(),
					hydration: 'hydrated',
					hrefItemId: 'hello-world'
				},
				{
					itemId: 'second',
					title: 'Second',
					sortDate: new Date('2026-04-04').getTime(),
					hydration: 'hydrated',
					hrefItemId: 'second'
				}
			],
			groups: []
		});
		expect(getCachedContent).not.toHaveBeenCalled();
	});

	it('clears the session and returns 401 when GitHub rejects the request', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([collectionConfig]) as never
		);
		vi.mocked(getCachedContent).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
				locals: {
					isAuthenticated: true,
					githubToken: 'secret-token',
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					}
				},
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
	});
});
