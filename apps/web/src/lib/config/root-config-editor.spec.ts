import { describe, expect, it } from 'vitest';
import {
	buildLocalPreviewUrlFromPort,
	getPreviewPortFromUrl,
	writeLocalPreviewUrl
} from '$lib/config/root-config-editor';
import type { RepositoryBackend } from '$lib/repository/types';

function createBackend(files: Record<string, string>): RepositoryBackend {
	return {
		kind: 'local',
		cacheKey: 'local:test',
		label: 'Local test',
		supportsDraftBranches: false,
		async discoverConfigs() {
			return [];
		},
		async discoverBlockConfigs() {
			return [];
		},
		async readRootConfig() {
			return null;
		},
		async readTextFile(path: string) {
			const value = files[path];
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}

			return value;
		},
		async writeTextFile(path: string, content: string) {
			files[path] = content;
		},
		async writeBinaryFile() {},
		async deleteFile(path: string) {
			delete files[path];
		},
		async listDirectory() {
			return [];
		},
		async fileExists(path: string) {
			return path in files;
		}
	};
}

describe('root config editor helpers', () => {
	it('extracts the current preview port from a URL', () => {
		expect(getPreviewPortFromUrl('http://localhost:5174')).toBe('5174');
		expect(getPreviewPortFromUrl('https://example.com')).toBe('443');
		expect(getPreviewPortFromUrl(null)).toBe('');
	});

	it('builds a local preview URL while preserving the existing host', () => {
		expect(buildLocalPreviewUrlFromPort('4173', 'http://127.0.0.1:5173')).toBe(
			'http://127.0.0.1:4173/'
		);
		expect(buildLocalPreviewUrlFromPort('5173', null)).toBe('http://localhost:5173/');
	});

	it('rejects invalid preview ports', () => {
		expect(() => buildLocalPreviewUrlFromPort('0')).toThrow(/between 1 and 65535/);
		expect(() => buildLocalPreviewUrlFromPort('abc')).toThrow(/between 1 and 65535/);
	});

	it('writes local.previewUrl without dropping existing root config values', async () => {
		const files = {
			'.tentman.json': JSON.stringify({
				siteName: 'Docs',
				configsDir: 'tentman/configs',
				local: {
					previewUrl: 'http://localhost:5173/',
					other: true
				}
			})
		};

		await writeLocalPreviewUrl(createBackend(files), 'http://localhost:4173/', {
			message: 'Update local preview URL'
		});

		expect(JSON.parse(files['.tentman.json'])).toEqual({
			siteName: 'Docs',
			configsDir: 'tentman/configs',
			local: {
				previewUrl: 'http://localhost:4173/',
				other: true
			}
		});
	});

	it('creates a root config when the repo does not have one yet', async () => {
		const files: Record<string, string> = {};

		await writeLocalPreviewUrl(createBackend(files), 'http://localhost:5173/');

		expect(JSON.parse(files['.tentman.json'])).toEqual({
			local: {
				previewUrl: 'http://localhost:5173/'
			}
		});
	});
});
