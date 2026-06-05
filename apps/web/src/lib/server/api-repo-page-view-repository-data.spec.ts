import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
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

import { GET } from '../../routes/api/repo/page-view/+server';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import {
	clearCollectionNavigationCache,
	clearRepositorySnapshotCache,
	clearSingletonDocumentCache
} from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';

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

describe('GET /api/repo/page-view repository data', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		clearCollectionNavigationCache();
		clearSingletonDocumentCache();
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});
	});

	it('returns collection navigation from GitHub tree data without loading full content', async () => {
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
			'src/content/posts/hello-world.md': `---\ntitle: "Hello world"\ndate: "2026-04-03"\n---\nFull body`
		});
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend,
			draftBranch: null
		} as never);

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=posts'),
			locals: {
				selectedRepo: {
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			content: null,
			collectionNavigation: {
				items: [
					{
						itemId: 'hello-world',
						title: 'hello world',
						sortDate: null,
						hydration: 'fallback',
						hrefItemId: 'hello-world'
					}
				],
				groups: []
			},
			mode: 'github',
			pageSlug: 'posts'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(backend.listDirectory).not.toHaveBeenCalled();
	});

	it('returns singleton content from GitHub blob data without loading full content', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"siteName": "Acme Docs"
			}`,
			'tentman/configs/about.tentman.json': `{
				"type": "content",
				"label": "About",
				"content": {
					"mode": "file",
					"path": "../../src/content/about.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "body", "type": "markdown", "label": "Body" }
				]
			}`,
			'src/content/about.md': `---\ntitle: "About from blob"\n---\nAbout body`
		});
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend,
			draftBranch: null
		} as never);

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=about'),
			locals: {
				selectedRepo: {
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'about'
			},
			content: {
				title: 'About from blob',
				body: 'About body'
			},
			collectionNavigation: null,
			mode: 'github',
			pageSlug: 'about'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
	});
});
