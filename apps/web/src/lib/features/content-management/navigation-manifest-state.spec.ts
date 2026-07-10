import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import {
	clearNavigationManifestStateCache,
	invalidateNavigationManifestStateCache,
	loadNavigationManifestState
} from './navigation-manifest';

class MemoryRepositoryBackend implements RepositoryBackend {
	kind = 'local' as const;
	cacheKey = 'memory';
	label = 'Memory';
	supportsDraftBranches = false;
	readTextFile = vi.fn<(path: string, options?: RepositoryReadOptions) => Promise<string>>();

	async discoverConfigs() {
		return [];
	}

	async discoverBlockConfigs() {
		return [];
	}

	async readRootConfig() {
		return null;
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
		throw new Error('loadNavigationManifestState should not call fileExists');
	}
}

describe('content-management/navigation-manifest state loading', () => {
	beforeEach(() => {
		clearNavigationManifestStateCache();
	});

	afterEach(() => {
		clearNavigationManifestStateCache();
	});

	it('caches manifest reads per backend key until invalidated', async () => {
		const backend = new MemoryRepositoryBackend();
		backend.readTextFile.mockResolvedValue(
			JSON.stringify({
				version: 1,
				content: {
					items: ['home']
				}
			})
		);

		await expect(loadNavigationManifestState(backend)).resolves.toMatchObject({
			exists: true,
			error: null
		});
		await expect(loadNavigationManifestState(backend)).resolves.toMatchObject({
			exists: true,
			error: null
		});
		expect(backend.readTextFile).toHaveBeenCalledTimes(1);

		invalidateNavigationManifestStateCache(backend);

		await expect(loadNavigationManifestState(backend)).resolves.toMatchObject({
			exists: true,
			error: null
		});
		expect(backend.readTextFile).toHaveBeenCalledTimes(2);
	});

	it('treats a 404 read as a missing manifest from a single read attempt', async () => {
		const backend = new MemoryRepositoryBackend();
		backend.readTextFile.mockRejectedValue({ status: 404 });

		await expect(loadNavigationManifestState(backend)).resolves.toEqual({
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		});
		expect(backend.readTextFile).toHaveBeenCalledTimes(1);
	});

	it('treats a local file system NotFoundError as a missing manifest', async () => {
		const backend = new MemoryRepositoryBackend();
		backend.readTextFile.mockRejectedValue(new DOMException('Missing file', 'NotFoundError'));

		await expect(loadNavigationManifestState(backend)).resolves.toEqual({
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		});
		expect(backend.readTextFile).toHaveBeenCalledTimes(1);
	});
});
