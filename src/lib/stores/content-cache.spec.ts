import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isParsedContentConfig, parseConfigFile } from '$lib/config/parse';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import { clearContentCache, getCachedContent } from './content-cache';

class MemoryRepositoryBackend implements RepositoryBackend {
	kind = 'local' as const;
	cacheKey = 'memory';
	label = 'Memory';
	supportsDraftBranches = false;
	readCount = 0;
	files = new Map<string, string>();

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
});
