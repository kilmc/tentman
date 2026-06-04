import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isParsedContentConfig, parseConfigFile } from '$lib/config/parse';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import { clearContentCache, getCachedContent, invalidateContent } from './content-cache';

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
	readCount = 0;
	files = new Map<string, string>();
	pendingReads = new Map<string, ReturnType<typeof createDeferred<string>>>();

	constructor(initialFiles: Record<string, string>) {
		for (const [path, content] of Object.entries(initialFiles)) {
			this.files.set(path, content);
		}
	}

	async discoverConfigs() {
		return [];
	}

	async discoverBlockConfigs() {
		return [];
	}

	async readRootConfig() {
		return null;
	}

	async readTextFile(path: string, _options?: RepositoryReadOptions): Promise<string> {
		this.readCount += 1;

		const pendingRead = this.pendingReads.get(path);
		if (pendingRead) {
			return pendingRead.promise;
		}

		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}

		return content;
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

	async fileExists(path: string): Promise<boolean> {
		return this.files.has(path);
	}
}

function parseContentConfigFixture(content: string) {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error('Expected a parsed content config fixture');
	}

	return parsed;
}

const singletonConfig = parseContentConfigFixture(
	JSON.stringify({
		type: 'content',
		label: 'Site Settings',
		content: {
			mode: 'file',
			path: './site.json'
		},
		blocks: [{ id: 'title', type: 'text', label: 'Title' }]
	})
);

describe('stores/content-cache', () => {
	beforeEach(() => {
		clearContentCache();
	});

	afterEach(() => {
		clearContentCache();
	});

	it('caches service-backed content reads by config slug and branch', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/site.json': '{\n  "title": "Tentman"\n}\n'
		});

		const first = await getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings'
		);
		const second = await getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings'
		);
		const draft = await getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings',
			'draft/settings'
		);

		expect(first).toEqual({ title: 'Tentman' });
		expect(second).toEqual(first);
		expect(draft).toEqual(first);
		expect(backend.readCount).toBe(2);
	});

	it('dedupes concurrent content fetches for the same config and branch', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/site.json': '{\n  "title": "Tentman"\n}\n'
		});
		const pendingRead = createDeferred<string>();
		backend.pendingReads.set('content/site.json', pendingRead);

		const firstPromise = getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings'
		);
		const secondPromise = getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings'
		);

		expect(backend.readCount).toBe(1);

		pendingRead.resolve('{\n  "title": "Tentman"\n}\n');

		await expect(firstPromise).resolves.toEqual({ title: 'Tentman' });
		await expect(secondPromise).resolves.toEqual({ title: 'Tentman' });
	});

	it('clears inflight state after a failed content fetch', async () => {
		const backend = new MemoryRepositoryBackend({});

		await expect(
			getCachedContent(backend, singletonConfig, 'content/settings.tentman.json', 'settings')
		).rejects.toThrow('File not found: content/site.json');

		backend.files.set('content/site.json', '{\n  "title": "Tentman"\n}\n');

		await expect(
			getCachedContent(backend, singletonConfig, 'content/settings.tentman.json', 'settings')
		).resolves.toEqual({ title: 'Tentman' });
		expect(backend.readCount).toBe(2);
	});

	it('drops inflight content fetches during invalidation', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/site.json': '{\n  "title": "Tentman"\n}\n'
		});
		const pendingRead = createDeferred<string>();
		backend.pendingReads.set('content/site.json', pendingRead);

		const firstPromise = getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings'
		);

		invalidateContent(backend.cacheKey, 'settings');
		backend.pendingReads.delete('content/site.json');

		const secondPromise = getCachedContent(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			'settings'
		);

		expect(backend.readCount).toBe(2);

		pendingRead.resolve('{\n  "title": "Tentman"\n}\n');

		await expect(firstPromise).resolves.toEqual({ title: 'Tentman' });
		await expect(secondPromise).resolves.toEqual({ title: 'Tentman' });
	});
});
