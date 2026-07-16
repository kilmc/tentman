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

function createGitHubBackend(): GitHubRepositoryBackend {
	const octokit = {
		rest: {
			repos: {
				getBranch: vi.fn(async () => ({
					status: 200,
					headers: {},
					data: {
						commit: {
							sha: 'commit-main'
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
							sha: 'tree-main'
						}
					}
				})),
				getTree: vi.fn(async () => {
					throw new Error('freshness must not load repository trees when identity is unchanged');
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
});
