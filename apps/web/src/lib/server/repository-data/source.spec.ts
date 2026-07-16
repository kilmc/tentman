import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import {
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';
import {
	clearGitHubTextBlobCache,
	getRepositoryRefIdentity,
	getRepositoryTree,
	readGitHubTextBlob
} from './source';

function createBackend(): GitHubRepositoryBackend {
	return {
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit: {
			rest: {
				repos: {
					getBranch: vi.fn(async () => ({
						status: 200,
						headers: {
							'x-ratelimit-remaining': '4999'
						},
						data: {
							commit: {
								sha: 'commit-main',
								commit: {
									committer: {
										date: '2026-01-01T00:00:00.000Z'
									}
								}
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
					getTree: vi.fn(async () => ({
						status: 200,
						headers: {},
						data: {
							truncated: false,
							tree: [
								{
									path: 'src/content/posts/hello.md',
									sha: 'blob-hello',
									type: 'blob',
									size: 12
								}
							]
						}
					})),
					getBlob: vi.fn(async () => ({
						status: 200,
						headers: {},
						data: {
							content: Buffer.from('Hello').toString('base64')
						}
					}))
				}
			}
		} as never
	} as unknown as GitHubRepositoryBackend;
}

describe('repository-data source instrumentation', () => {
	beforeEach(() => {
		clearWorkflowInstrumentationEventsForTests();
		clearGitHubTextBlobCache();
	});

	it('records GitHub branch, commit, tree, blob, and blob cache outcomes', async () => {
		const backend = createBackend();
		const identity = await getRepositoryRefIdentity(backend, 'main');
		await getRepositoryTree(backend, identity);
		await expect(readGitHubTextBlob(backend, 'blob-hello')).resolves.toBe('Hello');
		await expect(readGitHubTextBlob(backend, 'blob-hello')).resolves.toBe('Hello');

		const events = getWorkflowInstrumentationEventsForTests();
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'github-request',
					source: 'repository-data',
					operation: 'getRefIdentityBranch',
					requestKind: 'branch',
					responseStatus: 200,
					rateLimit: expect.objectContaining({
						remaining: '4999'
					})
				}),
				expect.objectContaining({
					kind: 'github-request',
					source: 'repository-data',
					operation: 'getRefIdentityCommit',
					requestKind: 'commit'
				}),
				expect.objectContaining({
					kind: 'github-request',
					source: 'repository-data',
					operation: 'getRepositoryTree',
					requestKind: 'tree'
				}),
				expect.objectContaining({
					kind: 'github-request',
					source: 'repository-data',
					operation: 'readGitHubTextBlob',
					requestKind: 'blob',
					cacheResult: 'miss',
					dedupeState: 'unique'
				}),
				expect.objectContaining({
					kind: 'cache-outcome',
					cacheArea: 'item-document',
					outcome: 'miss',
					reason: 'text blob missing from memory cache'
				}),
				expect.objectContaining({
					kind: 'cache-outcome',
					cacheArea: 'item-document',
					outcome: 'hit',
					reason: 'text blob already decoded in memory'
				})
			])
		);
		expect(backend.octokit.rest.git.getBlob).toHaveBeenCalledTimes(1);
	});
});
