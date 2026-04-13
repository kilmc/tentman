import type { LoadLocalBlockAdapterModule } from '$lib/blocks/adapter-files';
import {
	type DiscoveredBlockConfig,
	type DiscoveredConfig,
	getDiscoverableBlockConfigPaths,
	getDiscoverableContentConfigPaths,
	parseDiscoveredBlockConfig,
	parseDiscoveredConfig
} from '$lib/config/discovery';
import { parseRootConfig, type RootConfig } from '$lib/config/root-config';
import type {
	RepoEntry,
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

interface LoadJavaScriptModuleOptions {
	createObjectURL?: (blob: Blob) => string;
	revokeObjectURL?: (url: string) => void;
	importModule?: (moduleUrl: string) => Promise<unknown>;
}

function supportsLocalAdapterModulePath(path: string): boolean {
	return path.endsWith('.js') || path.endsWith('.mjs');
}

export async function loadJavaScriptModuleFromText(
	source: string,
	path: string,
	options: LoadJavaScriptModuleOptions = {}
): Promise<unknown> {
	const createObjectURL = options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
	const revokeObjectURL = options.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
	const importModule =
		options.importModule ?? ((moduleUrl: string) => import(/* @vite-ignore */ moduleUrl));
	const moduleUrl = createObjectURL(
		new Blob([`${source}\n//# sourceURL=${path}`], { type: 'text/javascript' })
	);

	try {
		return await importModule(moduleUrl);
	} finally {
		revokeObjectURL(moduleUrl);
	}
}

async function getPathHandle(
	root: FileSystemDirectoryHandle,
	path: string,
	options?: { create?: boolean }
): Promise<FileSystemHandle> {
	const segments = path.split('/').filter(Boolean);
	if (segments.length === 0) {
		return root;
	}

	let current: FileSystemDirectoryHandle = root;

	for (const [index, segment] of segments.entries()) {
		const isLast = index === segments.length - 1;
		if (isLast) {
			try {
				return await current.getFileHandle(segment, { create: options?.create });
			} catch (error) {
				try {
					return await current.getDirectoryHandle(segment, { create: options?.create });
				} catch {
					if (options?.create) {
						throw error;
					}

					throw error;
				}
			}
		}

		current = await current.getDirectoryHandle(segment, { create: options?.create });
	}

	return current;
}

async function pathExists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
	try {
		await getPathHandle(root, path);
		return true;
	} catch {
		return false;
	}
}

async function getDirectoryHandle(
	root: FileSystemDirectoryHandle,
	path: string,
	create = false
): Promise<FileSystemDirectoryHandle> {
	const segments = path.split('/').filter(Boolean);
	let current = root;

	for (const segment of segments) {
		current = await current.getDirectoryHandle(segment, { create });
	}

	return current;
}

async function getFileHandle(
	root: FileSystemDirectoryHandle,
	path: string,
	create = false
): Promise<FileSystemFileHandle> {
	const segments = path.split('/').filter(Boolean);
	const fileName = segments.pop();

	if (!fileName) {
		throw new Error(`Expected file path, received "${path}"`);
	}

	const directory =
		segments.length > 0 ? await getDirectoryHandle(root, segments.join('/'), create) : root;
	return directory.getFileHandle(fileName, { create });
}

async function readFileText(root: FileSystemDirectoryHandle, path: string): Promise<string> {
	const handle = await getFileHandle(root, path);
	const file = await handle.getFile();
	return file.text();
}

async function writeFileText(
	root: FileSystemDirectoryHandle,
	path: string,
	content: string
): Promise<void> {
	const handle = await getFileHandle(root, path, true);
	const writable = await handle.createWritable();
	await writable.write(content);
	await writable.close();
}

async function writeFileBytes(
	root: FileSystemDirectoryHandle,
	path: string,
	content: Uint8Array
): Promise<void> {
	const handle = await getFileHandle(root, path, true);
	const writable = await handle.createWritable();
	const buffer = content.buffer.slice(
		content.byteOffset,
		content.byteOffset + content.byteLength
	) as ArrayBuffer;
	await writable.write(buffer);
	await writable.close();
}

async function deletePath(root: FileSystemDirectoryHandle, path: string): Promise<void> {
	const segments = path.split('/').filter(Boolean);
	const fileName = segments.pop();

	if (!fileName) {
		throw new Error(`Expected file path, received "${path}"`);
	}

	const directory = segments.length > 0 ? await getDirectoryHandle(root, segments.join('/')) : root;
	await directory.removeEntry(fileName);
}

async function listDirectoryEntries(
	root: FileSystemDirectoryHandle,
	path: string
): Promise<RepoEntry[]> {
	const directory = path && path !== '.' ? await getDirectoryHandle(root, path) : root;
	const entries: RepoEntry[] = [];

	if (!directory.entries) {
		throw new Error('The current browser does not support directory iteration.');
	}

	for await (const [name, handle] of directory.entries()) {
		entries.push({
			name,
			path: path && path !== '.' ? `${path}/${name}` : name,
			kind: handle.kind === 'directory' ? 'directory' : 'file'
		});
	}

	return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function findTentmanFiles(root: FileSystemDirectoryHandle, path = '.'): Promise<string[]> {
	const entries = await listDirectoryEntries(root, path);
	const configPaths: string[] = [];

	for (const entry of entries) {
		if (entry.kind === 'directory') {
			if (entry.name === '.git') {
				continue;
			}

			configPaths.push(...(await findTentmanFiles(root, entry.path)));
			continue;
		}

		if (!entry.name.endsWith('.tentman.json')) {
			continue;
		}

		if (entry.name.startsWith('_')) {
			continue;
		}

		configPaths.push(entry.path);
	}

	return configPaths;
}

export interface LocalRepositoryIdentity {
	name: string;
	pathLabel: string;
}

export interface LocalRepositoryBackend extends RepositoryBackend {
	kind: 'local';
	rootHandle: FileSystemDirectoryHandle;
	repo: LocalRepositoryIdentity;
	invalidateDiscoveryCache(): void;
	loadLocalAdapterModule(path: string): Promise<unknown>;
}

export function createLocalRepositoryBackend(
	rootHandle: FileSystemDirectoryHandle,
	repo: LocalRepositoryIdentity
): LocalRepositoryBackend {
	let discoveryCache: Promise<{
		rootConfig: RootConfig | null;
		configs: DiscoveredConfig[];
		blockConfigs: DiscoveredBlockConfig[];
	}> | null = null;

	function shouldInvalidateDiscovery(path: string): boolean {
		const normalizedPath = path.replace(/^\.\//, '');
		return normalizedPath === '.tentman.json' || normalizedPath.endsWith('.tentman.json');
	}

	async function readRootConfigFromDisk(): Promise<RootConfig | null> {
		try {
			const content = await readFileText(rootHandle, '.tentman.json');
			return parseRootConfig(content);
		} catch {
			return null;
		}
	}

	async function loadDiscoveryData() {
		if (!discoveryCache) {
			discoveryCache = (async () => {
				const rootConfig = await readRootConfigFromDisk();
				const tentmanFiles = await findTentmanFiles(rootHandle);
				const contentPaths = getDiscoverableContentConfigPaths(tentmanFiles, rootConfig);
				const blockPaths = getDiscoverableBlockConfigPaths(tentmanFiles, rootConfig);
				const [configs, blockConfigs] = await Promise.all([
					Promise.all(
						contentPaths.map(async (path) =>
							parseDiscoveredConfig(path, await readFileText(rootHandle, path))
						)
					),
					Promise.all(
						blockPaths.map(async (path) =>
							parseDiscoveredBlockConfig(path, await readFileText(rootHandle, path))
						)
					)
				]);

				return {
					rootConfig,
					configs,
					blockConfigs
				};
			})().catch((error) => {
				discoveryCache = null;
				throw error;
			});
		}

		return discoveryCache;
	}

	return {
		kind: 'local',
		cacheKey: `local:${repo.pathLabel}`,
		label: repo.name,
		supportsDraftBranches: false,
		rootHandle,
		repo,

		invalidateDiscoveryCache() {
			discoveryCache = null;
		},

		async discoverConfigs() {
			const discoveryData = await loadDiscoveryData();
			return discoveryData.configs;
		},

		async discoverBlockConfigs() {
			const discoveryData = await loadDiscoveryData();
			return discoveryData.blockConfigs;
		},

		async readRootConfig(): Promise<RootConfig | null> {
			const discoveryData = await loadDiscoveryData();
			return discoveryData.rootConfig;
		},

		readTextFile(path: string, _options?: RepositoryReadOptions) {
			return readFileText(rootHandle, path);
		},

		async loadLocalAdapterModule(path: string) {
			if (!supportsLocalAdapterModulePath(path)) {
				throw new Error(
					`Local block adapter files must use .js or .mjs in local repository mode, received "${path}"`
				);
			}

			return loadJavaScriptModuleFromText(await readFileText(rootHandle, path), path);
		},

		async writeTextFile(path: string, content: string, _options?: RepositoryWriteOptions) {
			await writeFileText(rootHandle, path, content);
			if (shouldInvalidateDiscovery(path)) {
				discoveryCache = null;
			}
		},

		async writeBinaryFile(path: string, content: Uint8Array, _options?: RepositoryWriteOptions) {
			await writeFileBytes(rootHandle, path, content);
			if (shouldInvalidateDiscovery(path)) {
				discoveryCache = null;
			}
		},

		async deleteFile(path: string, _options?: RepositoryWriteOptions) {
			await deletePath(rootHandle, path);
			if (shouldInvalidateDiscovery(path)) {
				discoveryCache = null;
			}
		},

		listDirectory(path: string, _options?: RepositoryReadOptions) {
			return listDirectoryEntries(rootHandle, path);
		},

		fileExists(path: string, _options?: RepositoryReadOptions) {
			return pathExists(rootHandle, path);
		}
	};
}
