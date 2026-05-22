import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredConfig } from '$lib/config/discovery';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import { clearCache, getCachedConfigs, invalidateCache } from './config-cache';

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

class MemoryRepositoryBackend implements RepositoryBackend {
	kind = 'local' as const;
	cacheKey = 'memory';
	label = 'Memory';
	supportsDraftBranches = false;
	discoverConfigs = vi.fn<() => Promise<DiscoveredConfig[]>>(async () => []);

	async discoverBlockConfigs() {
		return [];
	}

	async readRootConfig() {
		return null;
	}

	async readTextFile(_path: string, _options?: RepositoryReadOptions): Promise<string> {
		throw new Error('Not implemented');
	}

	async writeTextFile(
		_path: string,
		_content: string,
		_options?: RepositoryWriteOptions
	): Promise<void> {
		throw new Error('Not implemented');
	}

	async writeBinaryFile(
		_path: string,
		_content: Uint8Array,
		_options?: RepositoryWriteOptions
	): Promise<void> {
		throw new Error('Not implemented');
	}

	async deleteFile(_path: string, _options?: RepositoryWriteOptions): Promise<void> {
		throw new Error('Not implemented');
	}

	async listDirectory(): Promise<{ name: string; path: string; kind: 'file' | 'directory' }[]> {
		return [];
	}

	async fileExists(): Promise<boolean> {
		return false;
	}
}

describe('stores/config-cache', () => {
	beforeEach(() => {
		clearCache();
	});

	afterEach(() => {
		clearCache();
	});

	it('dedupes concurrent config fetches for the same backend', async () => {
		const backend = new MemoryRepositoryBackend();
		const deferred = createDeferred<DiscoveredConfig[]>();
		backend.discoverConfigs.mockReturnValueOnce(deferred.promise);

		const firstPromise = getCachedConfigs(backend);
		const secondPromise = getCachedConfigs(backend);

		expect(backend.discoverConfigs).toHaveBeenCalledTimes(1);

		const result = [{ slug: 'posts' }] as unknown as DiscoveredConfig[];
		deferred.resolve(result);

		await expect(firstPromise).resolves.toBe(result);
		await expect(secondPromise).resolves.toBe(result);
	});

	it('clears inflight state after a failed fetch', async () => {
		const backend = new MemoryRepositoryBackend();

		backend.discoverConfigs.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);

		await expect(getCachedConfigs(backend)).rejects.toThrow('boom');
		await expect(getCachedConfigs(backend)).resolves.toEqual([]);
		expect(backend.discoverConfigs).toHaveBeenCalledTimes(2);
	});

	it('drops inflight fetches during invalidation', async () => {
		const backend = new MemoryRepositoryBackend();
		const deferred = createDeferred<DiscoveredConfig[]>();
		const freshResult = [{ slug: 'pages' }] as unknown as DiscoveredConfig[];

		backend.discoverConfigs
			.mockReturnValueOnce(deferred.promise)
			.mockResolvedValueOnce(freshResult);

		const firstPromise = getCachedConfigs(backend);
		invalidateCache(backend.cacheKey);
		const secondPromise = getCachedConfigs(backend);

		expect(backend.discoverConfigs).toHaveBeenCalledTimes(2);

		deferred.resolve([]);

		await expect(firstPromise).resolves.toEqual([]);
		await expect(secondPromise).resolves.toBe(freshResult);
	});
});
