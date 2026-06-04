import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryBackend } from '$lib/repository/types';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import { clearRepositorySnapshotCache, getRepositorySnapshot } from './snapshot';

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	}))
}));

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import { getCachedConfigs } from '$lib/stores/config-cache';

function createBackend(overrides: Partial<RepositoryBackend> = {}): RepositoryBackend {
	return {
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => ({ siteName: 'Acme Docs' })),
		readTextFile: vi.fn(async () => ''),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false),
		...overrides
	};
}

function encodeBlob(value: string): string {
	return Buffer.from(value, 'utf-8').toString('base64');
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
		...(createBackend({
			cacheKey: 'github:acme/docs?ref=main',
			discoverBlockConfigs: vi.fn(async () => {
				throw new Error('legacy block discovery should not run');
			}),
			readRootConfig: vi.fn(async () => {
				throw new Error('legacy root config read should not run');
			})
		}) as GitHubRepositoryBackend),
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit: octokit as never
	};
}

describe('repository snapshot data layer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				slug: 'posts',
				path: 'content/posts.tentman.json',
				config: {
					label: 'Posts',
					collection: true,
					content: { mode: 'directory' },
					blocks: []
				}
			}
		] as never);
	});

	it('loads bootstrap pieces into indexed snapshot data', async () => {
		const blockConfig = {
			id: 'gallery',
			path: 'blocks/gallery.tentman.json',
			config: { id: 'gallery', label: 'Gallery', blocks: [] }
		};
		const backend = createBackend({
			discoverBlockConfigs: vi.fn(async () => [blockConfig] as never)
		});

		const snapshot = await getRepositorySnapshot({ backend });

		expect(snapshot.identity).toMatchObject({
			mode: 'github',
			repoKey: 'github:acme/docs?ref=main',
			ref: 'main'
		});
		expect(snapshot.configIndex.bySlug.get('posts')?.path).toBe('content/posts.tentman.json');
		expect(snapshot.blockConfigIndex.byId.get('gallery')).toEqual(blockConfig);
		expect(snapshot.rootConfig).toEqual({ siteName: 'Acme Docs' });
		expect(snapshot.navigationManifest.path).toBe('tentman/navigation-manifest.json');
	});

	it('dedupes concurrent snapshot loads for the same repo and ref', async () => {
		let resolveConfigs: (value: never) => void = () => undefined;
		vi.mocked(getCachedConfigs).mockReturnValue(
			new Promise((resolve) => {
				resolveConfigs = resolve;
			})
		);
		const backend = createBackend();

		const first = getRepositorySnapshot({ backend });
		const second = getRepositorySnapshot({ backend });

		resolveConfigs([] as never);
		const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);

		expect(firstSnapshot).toBe(secondSnapshot);
		expect(getCachedConfigs).toHaveBeenCalledTimes(1);
		expect(backend.discoverBlockConfigs).toHaveBeenCalledTimes(1);
		expect(backend.readRootConfig).toHaveBeenCalledTimes(1);
		expect(loadNavigationManifestState).toHaveBeenCalledTimes(1);
	});

	it('reuses a loaded snapshot while the repo ref identity is unchanged', async () => {
		const backend = createBackend();

		const first = await getRepositorySnapshot({ backend });
		const second = await getRepositorySnapshot({ backend });

		expect(second).toBe(first);
		expect(getCachedConfigs).toHaveBeenCalledTimes(1);
		expect(backend.discoverBlockConfigs).toHaveBeenCalledTimes(1);
		expect(backend.readRootConfig).toHaveBeenCalledTimes(1);
	});

	it('discovers GitHub root, content, and block configs from one tree', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"blocksDir": "tentman/blocks",
				"siteName": "Acme Docs"
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"itemLabel": "title",
				"content": {
					"mode": "directory",
					"path": "src/content/posts",
					"template": "src/content/posts/_template.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" }
				]
			}`,
			'tentman/blocks/seo.tentman.json': `{
				"type": "block",
				"id": "seo",
				"label": "SEO",
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" }
				]
			}`,
			'tentman/navigation-manifest.json': `{"version":1,"configs":[]}`
		});

		const snapshot = await getRepositorySnapshot({ backend });

		expect(snapshot.identity).toMatchObject({
			ref: 'main',
			headSha: 'commit-main',
			treeSha: 'tree-main'
		});
		expect(snapshot.rootConfig).toMatchObject({ siteName: 'Acme Docs' });
		expect(snapshot.configIndex.configs).toHaveLength(1);
		expect(snapshot.configIndex.bySlug.get('posts')?.path).toBe(
			'tentman/configs/posts.tentman.json'
		);
		expect(snapshot.blockConfigIndex.configs).toHaveLength(1);
		expect(snapshot.blockConfigIndex.byId.get('seo')?.path).toBe('tentman/blocks/seo.tentman.json');
		expect(getCachedConfigs).not.toHaveBeenCalled();
		expect(backend.discoverBlockConfigs).not.toHaveBeenCalled();
		expect(backend.readRootConfig).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
	});
});
