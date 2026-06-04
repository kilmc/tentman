import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	clearRepositorySnapshotCache,
	getRepositorySnapshot,
	invalidateRepositoryData
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

function createGitHubBackend(): GitHubRepositoryBackend {
	const files = {
		'tentman.json': '{ "configsDir": "tentman/configs" }',
		'tentman/configs/posts.tentman.json': `{
			"type": "content",
			"label": "Posts",
			"collection": true,
			"content": {
				"mode": "directory",
				"path": "../../src/content/posts",
				"template": "../../src/content/posts/_template.md"
			},
			"blocks": []
		}`,
		'src/content/posts/hello.md': '---\ntitle: Hello\n---\n'
	};
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
		...(createBaseBackend() as GitHubRepositoryBackend),
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit: octokit as never
	};
}

describe('repository data invalidation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
	});

	it('keeps repository snapshots for scoped content-only invalidations', async () => {
		const backend = createGitHubBackend();

		await getRepositorySnapshot({ backend, ref: 'main' });
		invalidateRepositoryData({
			backend,
			ref: 'main',
			changedPaths: ['src/content/posts/hello.md'],
			reason: 'content-write'
		});
		await getRepositorySnapshot({ backend, ref: 'main' });

		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
	});

	it('clears repository snapshots for scoped config invalidations', async () => {
		const backend = createGitHubBackend();

		await getRepositorySnapshot({ backend, ref: 'main' });
		invalidateRepositoryData({
			backend,
			ref: 'main',
			changedPaths: ['tentman/configs/posts.tentman.json'],
			reason: 'content-write'
		});
		await getRepositorySnapshot({ backend, ref: 'main' });

		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(2);
	});

	it('keeps other refs when invalidating a path-unknown draft ref', async () => {
		const backend = createGitHubBackend();

		await getRepositorySnapshot({ backend, ref: 'main' });
		await getRepositorySnapshot({ backend, ref: 'tentman-preview' });
		invalidateRepositoryData({
			backend,
			ref: 'tentman-preview',
			reason: 'discard'
		});
		await getRepositorySnapshot({ backend, ref: 'main' });
		await getRepositorySnapshot({ backend, ref: 'tentman-preview' });

		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(3);
	});
});
