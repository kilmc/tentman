import { describe, expect, it, vi } from 'vitest';
import type { RepositoryBackend, RepositoryFileChange } from './types';
import { withBatchedRepositoryWrites, withTrackedBatchedRepositoryWrites } from './batch';

function createBackend(): RepositoryBackend {
	return {
		kind: 'github',
		cacheKey: 'github:acme/docs',
		label: 'acme/docs',
		supportsDraftBranches: true,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async () => 'from-repo'),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false),
		commitChanges: vi.fn(async () => undefined)
	};
}

describe('withTrackedBatchedRepositoryWrites', () => {
	it('returns the action result with normalized changed paths', async () => {
		const backend = createBackend();

		const tracked = await withTrackedBatchedRepositoryWrites(
			backend,
			{ ref: 'tentman-preview' },
			async (batchBackend) => {
				await batchBackend.writeTextFile('/content/posts/hello.md', 'hello');
				await batchBackend.writeTextFile('content/posts/hello.md', 'hello again');
				await batchBackend.deleteFile('content/posts/old.md');
				return 'done';
			}
		);

		expect(tracked).toEqual({
			result: 'done',
			changedPaths: ['content/posts/hello.md', 'content/posts/old.md']
		});
		expect(backend.commitChanges).toHaveBeenCalledWith(
			[
				{
					type: 'writeText',
					path: 'content/posts/hello.md',
					content: 'hello'
				},
				{
					type: 'writeText',
					path: 'content/posts/hello.md',
					content: 'hello again'
				},
				{
					type: 'delete',
					path: 'content/posts/old.md'
				}
			] satisfies RepositoryFileChange[],
			{ ref: 'tentman-preview' }
		);
	});
});

describe('withBatchedRepositoryWrites', () => {
	it('preserves the original result-only contract', async () => {
		const backend = createBackend();

		const result = await withBatchedRepositoryWrites(backend, undefined, async (batchBackend) => {
			await batchBackend.writeTextFile('content/about.md', 'about');
			return 42;
		});

		expect(result).toBe(42);
	});
});
