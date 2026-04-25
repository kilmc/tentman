import { describe, expect, it, vi } from 'vitest';
import { createLocalRepositoryBackend, loadJavaScriptModuleFromText } from '$lib/repository/local';

describe('loadJavaScriptModuleFromText', () => {
	it('imports module source through a blob url and revokes the url afterward', async () => {
		const createObjectURL = vi.fn().mockReturnValue('blob:tentman-test');
		const revokeObjectURL = vi.fn();
		const importModule = vi.fn().mockResolvedValue({
			adapter: {
				type: 'gallery',
				getDefaultValue() {
					return [];
				}
			}
		});

		const moduleValue = await loadJavaScriptModuleFromText(
			'export const adapter = { type: "gallery" };',
			'tentman/blocks/gallery.adapter.js',
			{
				createObjectURL,
				revokeObjectURL,
				importModule
			}
		);

		expect(moduleValue).toMatchObject({
			adapter: {
				type: 'gallery'
			}
		});
		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(importModule).toHaveBeenCalledWith('blob:tentman-test');
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:tentman-test');

		const moduleBlob = createObjectURL.mock.calls[0]?.[0];
		expect(moduleBlob).toBeInstanceOf(Blob);
		await expect(moduleBlob.text()).resolves.toContain(
			'//# sourceURL=tentman/blocks/gallery.adapter.js'
		);
	});
});

describe('createLocalRepositoryBackend', () => {
	function createFileHandle(content: string): FileSystemFileHandle {
		return {
			kind: 'file',
			name: 'mock-file',
			async isSameEntry() {
				return false;
			},
			async getFile() {
				return {
					async text() {
						return content;
					}
				} as File;
			},
			async createWritable() {
				throw new Error('Not implemented');
			}
		} as unknown as FileSystemFileHandle;
	}

	function createDirectoryHandle(
		entriesByName: Record<string, FileSystemDirectoryHandle | FileSystemFileHandle>
	): FileSystemDirectoryHandle {
		const entries = async function* () {
			for (const [name, handle] of Object.entries(entriesByName)) {
				yield [name, handle] as const;
			}
		};

		return {
			kind: 'directory',
			name: 'mock-directory',
			async isSameEntry() {
				return false;
			},
			async getDirectoryHandle(name: string) {
				const entry = entriesByName[name];
				if (!entry || entry.kind !== 'directory') {
					throw new Error(`Missing directory: ${name}`);
				}

				return entry;
			},
			async getFileHandle(name: string) {
				const entry = entriesByName[name];
				if (!entry || entry.kind !== 'file') {
					throw new Error(`Missing file: ${name}`);
				}

				return entry;
			},
			async removeEntry() {
				throw new Error('Not implemented');
			},
			async resolve() {
				return null;
			},
			entries,
			keys: entries,
			values: entries,
			[Symbol.asyncIterator]() {
				return entries();
			}
		} as unknown as FileSystemDirectoryHandle;
	}

	it('treats directories as existing paths for local discovery helpers', async () => {
		const instructionsHandle = createDirectoryHandle({});
		const tentmanHandle = createDirectoryHandle({
			instructions: instructionsHandle
		});
		const instructionsDirectory = {
			tentman: tentmanHandle
		};
		const rootHandle = createDirectoryHandle(instructionsDirectory);

		const backend = createLocalRepositoryBackend(rootHandle, {
			name: 'Test App',
			pathLabel: '~/Test App'
		});

		await expect(backend.fileExists('tentman/instructions')).resolves.toBe(true);
	});

	it('keeps valid configs discoverable when one local config fails to parse', async () => {
		const configsHandle = createDirectoryHandle({
			'posts.tentman.json': createFileHandle(`{
				"type": "content",
				"label": "Posts",
				"content": {
					"mode": "file",
					"path": "./src/content/posts.json"
				},
				"blocks": [{ "id": "title", "type": "text", "label": "Title" }]
			}`),
			'projects.tentman.json': createFileHandle(`{
				"type": "content",
				"label": "Projects",
				"collection": {
					"sorting": "manual",
					"groups": "broken"
				},
				"content": {
					"mode": "file",
					"path": "./src/content/projects.json"
				},
				"blocks": [{ "id": "title", "type": "text", "label": "Title" }]
			}`)
		});
		const rootHandle = createDirectoryHandle({
			tentman: createDirectoryHandle({
				configs: configsHandle
			}),
			'.tentman.json': createFileHandle(
				JSON.stringify({
					configsDir: './tentman/configs'
				})
			)
		});
		const backend = createLocalRepositoryBackend(rootHandle, {
			name: 'Test App',
			pathLabel: '~/Test App'
		});

		await expect(backend.discoverConfigs()).resolves.toMatchObject([
			{
				slug: 'posts',
				path: 'tentman/configs/posts.tentman.json'
			}
		]);
	});

	it('skips heavy generated directories during discovery', async () => {
		const explosiveDirectoryHandle = {
			kind: 'directory',
			name: 'node_modules',
			async isSameEntry() {
				return false;
			},
			async getDirectoryHandle() {
				throw new Error('Should not traverse ignored directory');
			},
			async getFileHandle() {
				throw new Error('Should not traverse ignored directory');
			},
			async removeEntry() {
				throw new Error('Not implemented');
			},
			async resolve() {
				return null;
			},
			entries() {
				throw new Error('Should not enumerate ignored directory');
			},
			keys() {
				throw new Error('Should not enumerate ignored directory');
			},
			values() {
				throw new Error('Should not enumerate ignored directory');
			},
			[Symbol.asyncIterator]() {
				throw new Error('Should not enumerate ignored directory');
			}
		} as unknown as FileSystemDirectoryHandle;

		const rootHandle = createDirectoryHandle({
			'.tentman.json': createFileHandle(
				JSON.stringify({
					configsDir: './tentman/configs'
				})
			),
			node_modules: explosiveDirectoryHandle,
			tentman: createDirectoryHandle({
				configs: createDirectoryHandle({
					'posts.tentman.json': createFileHandle(`{
						"type": "content",
						"label": "Posts",
						"content": {
							"mode": "file",
							"path": "./src/content/posts.json"
						},
						"blocks": [{ "id": "title", "type": "text", "label": "Title" }]
					}`)
				})
			})
		});
		const backend = createLocalRepositoryBackend(rootHandle, {
			name: 'Test App',
			pathLabel: '~/Test App'
		});

		await expect(backend.discoverConfigs()).resolves.toMatchObject([
			{
				slug: 'posts',
				path: 'tentman/configs/posts.tentman.json'
			}
		]);
	});

	it('limits discovery to configured content and block directories', async () => {
		const unrelatedDirectoryHandle = {
			kind: 'directory',
			name: 'src',
			async isSameEntry() {
				return false;
			},
			async getDirectoryHandle() {
				throw new Error('Should not traverse unrelated directory');
			},
			async getFileHandle() {
				throw new Error('Should not traverse unrelated directory');
			},
			async removeEntry() {
				throw new Error('Not implemented');
			},
			async resolve() {
				return null;
			},
			entries() {
				throw new Error('Should not enumerate unrelated directory');
			},
			keys() {
				throw new Error('Should not enumerate unrelated directory');
			},
			values() {
				throw new Error('Should not enumerate unrelated directory');
			},
			[Symbol.asyncIterator]() {
				throw new Error('Should not enumerate unrelated directory');
			}
		} as unknown as FileSystemDirectoryHandle;

		const rootHandle = createDirectoryHandle({
			'.tentman.json': createFileHandle(
				JSON.stringify({
					configsDir: './tentman/configs',
					blocksDir: './tentman/blocks'
				})
			),
			src: unrelatedDirectoryHandle,
			tentman: createDirectoryHandle({
				configs: createDirectoryHandle({
					'about.tentman.json': createFileHandle(`{
						"type": "content",
						"label": "About",
						"content": {
							"mode": "file",
							"path": "./src/content/about.json"
						},
						"blocks": [{ "id": "title", "type": "text", "label": "Title" }]
					}`)
				}),
				blocks: createDirectoryHandle({
					'image-gallery.tentman.json': createFileHandle(`{
						"type": "block",
						"id": "image-gallery",
						"label": "Image Gallery",
						"collection": true,
						"itemLabel": "Image",
						"blocks": [{ "id": "image", "type": "text", "label": "Image" }]
					}`)
				})
			})
		});
		const backend = createLocalRepositoryBackend(rootHandle, {
			name: 'Test App',
			pathLabel: '~/Test App'
		});

		await expect(backend.discoverConfigs()).resolves.toMatchObject([
			{
				slug: 'about',
				path: 'tentman/configs/about.tentman.json'
			}
		]);
		await expect(backend.discoverBlockConfigs()).resolves.toMatchObject([
			{
				id: 'image-gallery',
				path: 'tentman/blocks/image-gallery.tentman.json'
			}
		]);
	});
});
