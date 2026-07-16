import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

const pageContextMocks = vi.hoisted(() => ({
	requireGitHubContentRepository: vi.fn()
}));

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: pageContextMocks.requireGitHubContentRepository
}));

import { GET } from '../../routes/api/repo/freshness/+server';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import { getCachedConfigs } from '$lib/stores/config-cache';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

function createGitHubBackend(options?: {
	commitSha?: string;
	treeSha?: string;
	trees?: Record<string, Array<{ path: string; sha: string; type?: string }>>;
	missingTrees?: string[];
}): GitHubRepositoryBackend {
	const commitSha = options?.commitSha ?? 'commit-main';
	const treeSha = options?.treeSha ?? 'tree-main';
	const trees = options?.trees ?? {};
	const missingTrees = new Set(options?.missingTrees ?? []);
	const octokit = {
		rest: {
			repos: {
				getBranch: vi.fn(async () => ({
					status: 200,
					headers: {},
					data: {
						commit: {
							sha: commitSha
						}
					}
				}))
			},
			git: {
				getCommit: vi.fn(async () => ({
					status: 200,
					headers: {},
					data: {
						tree: {
							sha: treeSha
						}
					}
				})),
				getTree: vi.fn(async ({ tree_sha }: { tree_sha: string }) => {
					if (missingTrees.has(tree_sha)) {
						throw { status: 404 };
					}
					const tree = trees[tree_sha];
					if (!tree) {
						throw new Error('freshness must not load unexpected repository trees');
					}
					return {
						status: 200,
						headers: {},
						data: {
							tree,
							truncated: false
						}
					};
				}),
				getBlob: vi.fn(async () => {
					throw new Error('freshness must not load config blobs when identity is unchanged');
				})
			}
		}
	};

	return {
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		discoverConfigs: vi.fn(async () => {
			throw new Error('freshness must not run config discovery when identity is unchanged');
		}),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async () => {
			throw { status: 404 };
		}),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false),
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit: octokit as never
	};
}

describe('GET /api/repo/freshness', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns unchanged freshness from ref identity without loading bootstrap data', async () => {
		const backend = createGitHubBackend();
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend,
			draftBranch: null,
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			}
		});

		const response = await GET({
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies(),
			url: new URL(
				'https://tentman.test/api/repo/freshness?previousRef=main&previousHeadSha=commit-main&previousTreeSha=tree-main'
			)
		} as never);

		await expect(response.json()).resolves.toMatchObject({
			unchanged: true,
			repositoryIdentity: {
				ref: 'main',
				headSha: 'commit-main',
				treeSha: 'tree-main'
			},
			mainRepositoryIdentity: {
				ref: 'main',
				headSha: 'commit-main',
				treeSha: 'tree-main'
			},
			draftRepositoryIdentity: null
		});
		expect(backend.octokit.rest.repos.getBranch).toHaveBeenCalledTimes(1);
		expect(backend.octokit.rest.git.getCommit).toHaveBeenCalledTimes(1);
		expect(backend.octokit.rest.git.getTree).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getBlob).not.toHaveBeenCalled();
		expect(getCachedConfigs).not.toHaveBeenCalled();
		expect(backend.readRootConfig).not.toHaveBeenCalled();
		expect(backend.discoverBlockConfigs).not.toHaveBeenCalled();
	});

	it('returns changed paths from tree data without loading bootstrap data', async () => {
		const backend = createGitHubBackend({
			commitSha: 'commit-next',
			treeSha: 'tree-next',
			trees: {
				'tree-main': [
					{ path: 'src/content/posts/old.md', sha: 'blob-old', type: 'blob' },
					{ path: 'src/content/posts/same.md', sha: 'blob-same', type: 'blob' },
					{ path: 'tentman/configs/posts.tentman.json', sha: 'config-old', type: 'blob' }
				],
				'tree-next': [
					{ path: 'src/content/posts/new.md', sha: 'blob-new', type: 'blob' },
					{ path: 'src/content/posts/same.md', sha: 'blob-same', type: 'blob' },
					{ path: 'tentman/configs/posts.tentman.json', sha: 'config-new', type: 'blob' }
				]
			}
		});
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend,
			draftBranch: null,
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			}
		});

		const response = await GET({
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies(),
			url: new URL(
				'https://tentman.test/api/repo/freshness?previousRef=main&previousHeadSha=commit-main&previousTreeSha=tree-main'
			)
		} as never);

		await expect(response.json()).resolves.toMatchObject({
			unchanged: false,
			freshnessStatus: 'changed',
			repositoryIdentity: {
				ref: 'main',
				headSha: 'commit-next',
				treeSha: 'tree-next'
			},
			changedPaths: [
				'src/content/posts/new.md',
				'src/content/posts/old.md',
				'tentman/configs/posts.tentman.json'
			]
		});
		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledTimes(2);
		expect(backend.octokit.rest.git.getBlob).not.toHaveBeenCalled();
		expect(getCachedConfigs).not.toHaveBeenCalled();
		expect(backend.readRootConfig).not.toHaveBeenCalled();
		expect(backend.discoverBlockConfigs).not.toHaveBeenCalled();
	});

	it('returns recoverable stale status when the previous tree was deleted', async () => {
		const backend = createGitHubBackend({
			commitSha: 'commit-next',
			treeSha: 'tree-next',
			missingTrees: ['deleted-draft-tree'],
			trees: {
				'tree-next': [{ path: 'src/content/posts/current.md', sha: 'blob-current', type: 'blob' }]
			}
		});
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend,
			draftBranch: null,
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			}
		});

		const response = await GET({
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies(),
			url: new URL(
				'https://tentman.test/api/repo/freshness?previousRef=tentman-preview&previousHeadSha=deleted-draft-commit&previousTreeSha=deleted-draft-tree'
			)
		} as never);

		await expect(response.json()).resolves.toMatchObject({
			unchanged: false,
			freshnessStatus: 'stale',
			changedPaths: null,
			error: expect.stringContaining('previous GitHub tree is no longer available'),
			recovery: expect.stringContaining('Refresh stale GitHub cache records')
		});
		expect(backend.octokit.rest.git.getBlob).not.toHaveBeenCalled();
		expect(getCachedConfigs).not.toHaveBeenCalled();
	});
});
