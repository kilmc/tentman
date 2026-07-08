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

import { GET } from '../../routes/api/repo/configs/+server';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { clearRepositorySnapshotCache } from '$lib/server/repository-data';
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

function createGitHubBackendWithMissingPreviousTree(): GitHubRepositoryBackend {
	const files = {
		'tentman.json': '{ "configsDir": "tentman/configs" }',
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
		}`
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
				getTree: vi.fn(async ({ tree_sha }: { tree_sha: string }) => {
					if (tree_sha === 'deleted-draft-tree') {
						throw { status: 404 };
					}

					return {
						data: {
							truncated: false,
							tree: [...shasByPath.entries()].map(([path, sha]) => ({
								path,
								sha,
								type: 'blob',
								size: contentBySha.get(sha)?.length
							}))
						}
					};
				}),
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
		discoverConfigs: vi.fn(async () => []),
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

describe('GET /api/repo/configs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend: {
				kind: 'github',
				cacheKey: 'github:acme/docs?ref=main',
				label: 'acme/docs',
				supportsDraftBranches: true,
				discoverBlockConfigs: vi.fn(async () => []),
				readRootConfig: vi.fn(async () => null),
				readTextFile: vi.fn(async () => {
					throw { status: 404 };
				}),
				fileExists: vi.fn(async () => false)
			},
			draftBranch: null
		});
	});

	it('returns config discovery data for the selected repository', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				slug: 'posts',
				path: 'content/posts.tentman.json',
				config: {
					label: 'Posts',
					collection: true,
					content: {
						mode: 'directory'
					},
					blocks: []
				}
			}
		] as never);

		const cookies = createCookies();
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
			cookies
		} as never);

		expect(await response.json()).toMatchObject({
			configs: [
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory'
						},
						blocks: []
					}
				}
			],
			blockConfigs: [],
			rootConfig: null,
			activeDraftBranch: null,
			navigationManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: false,
				manifest: null,
				error: null
			},
			repositoryIdentity: {
				ref: 'main',
				headSha: 'github:acme/docs?ref=main:main',
				treeSha: 'github:acme/docs?ref=main:main'
			},
			mainRepositoryIdentity: {
				ref: 'main',
				headSha: 'github:acme/docs?ref=main:main',
				treeSha: 'github:acme/docs?ref=main:main'
			},
			draftRepositoryIdentity: null,
			changedPaths: null
		});
	});

	it('ignores a stale previous tree after a discarded draft branch', async () => {
		const backend = createGitHubBackendWithMissingPreviousTree();
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
				'https://tentman.test/api/repo/configs?previousRef=tentman-preview&previousHeadSha=deleted-draft-commit&previousTreeSha=deleted-draft-tree'
			)
		} as never);

		const body = await response.json();

		expect(body).toMatchObject({
			configs: [
				{
					slug: 'posts',
					path: 'tentman/configs/posts.tentman.json'
				}
			],
			repositoryIdentity: {
				ref: 'main',
				headSha: 'commit-main',
				treeSha: 'tree-main'
			},
			changedPaths: null
		});
		expect(backend.octokit.rest.git.getTree).toHaveBeenCalledWith(
			expect.objectContaining({ tree_sha: 'deleted-draft-tree' })
		);
	});

	it('clears the session and returns 401 when GitHub rejects config discovery', async () => {
		vi.mocked(getCachedConfigs).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
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
