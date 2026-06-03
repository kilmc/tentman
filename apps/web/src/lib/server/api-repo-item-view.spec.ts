import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

vi.mock('$lib/server/block-registry-data', () => ({
	loadGitHubBlockRegistryData: vi.fn()
}));

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	}))
}));

import { GET } from '../../routes/api/repo/item-view/+server';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import {
	clearCollectionNavigationCache,
	clearRepositorySnapshotCache
} from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';
import { getCachedConfigs } from '$lib/stores/config-cache';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

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
		readTextFile: vi.fn(async () => {
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

function createSnapshotFallbackBackend(cacheKey = 'github:acme/docs') {
	return {
		kind: 'github',
		cacheKey,
		label: 'acme/docs',
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null)
	};
}

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

describe('GET /api/repo/item-view', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		clearCollectionNavigationCache();
	});

	it('returns the selected collection item payload', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: createSnapshotFallbackBackend(),
			draftBranch: null
		} as never);
		vi.mocked(getCachedConfigs).mockResolvedValue([collectionConfig] as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			item: {
				_filename: 'hello-world.md',
				title: 'Hello world'
			},
			itemId: 'hello-world',
			mode: 'github',
			pageSlug: 'posts'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			collectionConfig.config,
			collectionConfig.path,
			collectionConfig.slug
		);
	});

	it('returns the active managed draft branch when content loads from the draft by default', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: createSnapshotFallbackBackend('github:acme/docs?ref=tentman-preview'),
			draftBranch: 'tentman-preview'
		} as never);
		vi.mocked(getCachedConfigs).mockResolvedValue([collectionConfig] as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Draft title'
			}
		]);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			item: {
				title: 'Draft title'
			},
			branch: 'tentman-preview'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'github:acme/docs?ref=tentman-preview' }),
			collectionConfig.config,
			collectionConfig.path,
			collectionConfig.slug
		);
	});

	it('resolves directory-backed GitHub items without loading the whole collection', async () => {
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
					{ "id": "body", "type": "markdown", "label": "Body" }
				]
			}`,
			'src/content/posts/_template.md': `---\ntitle: ""\n---\n`,
			'src/content/posts/hello-world.md': `---\ntitle: "Hello world"\n---\nFull body`,
			'src/content/posts/second.md': `---\ntitle: "Second"\n---\nSecond body`
		});

		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend,
			draftBranch: null
		} as never);
		vi.mocked(getCachedConfigs).mockResolvedValue([
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
						{ id: 'body', type: 'markdown' }
					]
				}
			}
		] as never);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			item: {
				_filename: 'hello-world.md',
				title: 'Hello world',
				body: 'Full body'
			}
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(backend.listDirectory).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getBlob).toHaveBeenCalledTimes(3);
	});

	it('resolves directory-backed GitHub items by route metadata without falling back to full content', async () => {
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
					{ "id": "slug", "type": "text", "label": "Slug" },
					{ "id": "body", "type": "markdown", "label": "Body" }
				]
			}`,
			'src/content/posts/_template.md': `---\ntitle: ""\nslug: ""\n---\n`,
			'src/content/posts/first.md': `---\ntitle: "Hello world"\nslug: "hello-world"\n---\nFull body`,
			'src/content/posts/second.md': `---\ntitle: "Second"\nslug: "second"\n---\nSecond body`
		});

		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend,
			draftBranch: null
		} as never);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			item: {
				_filename: 'first.md',
				title: 'Hello world',
				slug: 'hello-world',
				body: 'Full body'
			}
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(backend.listDirectory).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
	});

	it('returns a redirect target when the config is not a collection', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: createSnapshotFallbackBackend(),
			draftBranch: null
		} as never);
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				...collectionConfig,
				config: {
					...collectionConfig.config,
					collection: false
				}
			}
		] as never);

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			redirectTo: '/pages/posts/edit'
		});
	});

	it('clears the session and returns 401 when content fetch gets a GitHub 401', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: createSnapshotFallbackBackend(),
			draftBranch: null
		} as never);
		vi.mocked(getCachedConfigs).mockResolvedValue([collectionConfig] as never);
		vi.mocked(getCachedContent).mockRejectedValue({ status: 401 });
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
				locals: {},
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
