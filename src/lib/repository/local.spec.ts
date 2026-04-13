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
	it('treats directories as existing paths for local discovery helpers', async () => {
		function createDirectoryHandle(
			directories: Record<string, FileSystemDirectoryHandle>
		): FileSystemDirectoryHandle {
			const entries = async function* () {};

			return {
				kind: 'directory',
				name: 'mock-directory',
				async isSameEntry() {
					return false;
				},
				async getDirectoryHandle(name: string) {
					const directory = directories[name];
					if (!directory) {
						throw new Error(`Missing directory: ${name}`);
					}

					return directory;
				},
				async getFileHandle() {
					throw new Error('Not a file');
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
});
