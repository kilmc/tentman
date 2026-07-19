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

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		resolve,
		reject
	};
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

	it('limits concurrent GitHub text blob loads while preserving in-flight dedupe', async () => {
		const backend = createBackend();
		const deferredBySha = new Map<string, ReturnType<typeof createDeferred<unknown>>>();
		vi.mocked(backend.octokit.rest.git.getBlob).mockImplementation(async (params) => {
			const fileSha = params?.file_sha ?? '';
			const deferred = createDeferred<unknown>();
			deferredBySha.set(fileSha, deferred);
			return (await deferred.promise) as never;
		});

		const reads = ['blob-1', 'blob-2', 'blob-3', 'blob-4', 'blob-5', 'blob-5', 'blob-6'].map(
			(sha) => readGitHubTextBlob(backend, sha)
		);

		await expect.poll(() => backend.octokit.rest.git.getBlob).toHaveBeenCalledTimes(4);
		expect([...deferredBySha.keys()]).toEqual(['blob-1', 'blob-2', 'blob-3', 'blob-4']);

		for (const [sha, deferred] of deferredBySha) {
			deferred.resolve({
				status: 200,
				headers: {},
				data: {
					content: Buffer.from(sha).toString('base64')
				}
			});
		}

		await expect.poll(() => backend.octokit.rest.git.getBlob).toHaveBeenCalledTimes(6);
		expect([...deferredBySha.keys()]).toEqual([
			'blob-1',
			'blob-2',
			'blob-3',
			'blob-4',
			'blob-5',
			'blob-6'
		]);
		deferredBySha.get('blob-5')?.resolve({
			status: 200,
			headers: {},
			data: {
				content: Buffer.from('blob-5').toString('base64')
			}
		});
		deferredBySha.get('blob-6')?.resolve({
			status: 200,
			headers: {},
			data: {
				content: Buffer.from('blob-6').toString('base64')
			}
		});

		await expect(Promise.all(reads)).resolves.toEqual([
			'blob-1',
			'blob-2',
			'blob-3',
			'blob-4',
			'blob-5',
			'blob-5',
			'blob-6'
		]);
		expect(backend.octokit.rest.git.getBlob).toHaveBeenCalledTimes(6);
	});
});
