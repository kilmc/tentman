import type { LoadLocalBlockAdapterModule } from '$lib/blocks/adapter-files';
import {
	type DiscoveredBlockConfig,
	type DiscoveredConfig,
	getDiscoverableBlockConfigPaths,
	getDiscoverableContentConfigPaths,
	parseDiscoveredBlockConfig,
	parseDiscoveredConfig
} from '$lib/config/discovery';
import { normalizeRuntimeDiscoveredConfigIdentity } from '$lib/features/content-management/stable-identity';
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

const IGNORED_DISCOVERY_DIRECTORIES = new Set([
	'.git',
	'.idea',
	'.next',
	'.nuxt',
	'.output',
	'.parcel-cache',
	'.svelte-kit',
	'.turbo',
	'.vercel',
	'build',
	'coverage',
	'dist',
	'node_modules'
]);

function shouldSkipDiscoveryDirectory(path: string): boolean {
	const name = path.split('/').pop() ?? path;
	return IGNORED_DISCOVERY_DIRECTORIES.has(name);
}

async function findTentmanFiles(root: FileSystemDirectoryHandle, path = '.'): Promise<string[]> {
	const entries = await listDirectoryEntries(root, path);
	const configPaths: string[] = [];

	for (const entry of entries) {
		if (entry.kind === 'directory') {
			if (shouldSkipDiscoveryDirectory(entry.path)) {
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

export interface LocalDiscoverySignature {
	rootConfigText: string | null;
	navigationManifestText: string | null;
	contentConfigPaths: string[];
	blockConfigPaths: string[];
	pluginEntrypoints: Array<{
		path: string;
		exists: boolean;
	}>;
}

export interface LocalRepositoryBackend extends RepositoryBackend {
	kind: 'local';
	rootHandle: FileSystemDirectoryHandle;
	repo: LocalRepositoryIdentity;
	invalidateDiscoveryCache(): void;
	getDiscoverySignature(): Promise<LocalDiscoverySignature>;
	loadLocalAdapterModule(path: string): Promise<unknown>;
}

interface DiscoveryIssue {
	path: string;
	message: string;
}

function formatDiscoveryIssue(
	kind: 'content config' | 'block config',
	issue: DiscoveryIssue
): string {
	return `Failed to parse ${kind} at ${issue.path}: ${issue.message}`;
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

	async function readRootConfigTextFromDisk(): Promise<string | null> {
		try {
			return await readFileText(rootHandle, '.tentman.json');
		} catch {
			return null;
		}
	}

	function getPluginEntrypointPaths(rootConfig: RootConfig | null): string[] {
		const pluginsDir =
			rootConfig?.pluginsDir?.replace(/^\.\//, '').replace(/\/+$/, '') ?? 'tentman/plugins';
		const pluginIds =
			rootConfig?.plugins?.filter(
				(pluginId, index, values) => values.indexOf(pluginId) === index
			) ?? [];

		return pluginIds.flatMap((pluginId) => [
			`${pluginsDir}/${pluginId}/plugin.js`,
			`${pluginsDir}/${pluginId}/plugin.mjs`
		]);
	}

	async function getDiscoveryFilePaths(rootConfig: RootConfig | null): Promise<{
		contentConfigPaths: string[];
		blockConfigPaths: string[];
	}> {
		const discoveryRoots = Array.from(
			new Set(
				[rootConfig?.configsDir, rootConfig?.blocksDir]
					.map((value) => value?.replace(/^\.\//, '').replace(/\/+$/, ''))
					.filter((value): value is string => !!value && value.length > 0)
			)
		);
		const tentmanFiles =
			discoveryRoots.length > 0
				? (
						await Promise.all(
							discoveryRoots.map(async (path) => {
								try {
									return await findTentmanFiles(rootHandle, path);
								} catch {
									return [];
								}
							})
						)
					).flat()
				: await findTentmanFiles(rootHandle);

		return {
			contentConfigPaths: getDiscoverableContentConfigPaths(tentmanFiles, rootConfig),
			blockConfigPaths: getDiscoverableBlockConfigPaths(tentmanFiles, rootConfig)
		};
	}

	async function getDiscoverySignature(): Promise<LocalDiscoverySignature> {
		const rootConfigText = await readRootConfigTextFromDisk();
		const navigationManifestText = await readFileText(rootHandle, 'tentman/navigation-manifest.json')
			.then((value) => value)
			.catch(() => null);
		const rootConfig = (() => {
			if (!rootConfigText) {
				return null;
			}

			try {
				return parseRootConfig(rootConfigText);
			} catch {
				return null;
			}
		})();
		const { contentConfigPaths, blockConfigPaths } = await getDiscoveryFilePaths(rootConfig);
		const pluginEntrypoints = await Promise.all(
			getPluginEntrypointPaths(rootConfig).map(async (path) => ({
				path,
				exists: await pathExists(rootHandle, path)
			}))
		);

		return {
			rootConfigText,
			navigationManifestText,
			contentConfigPaths,
			blockConfigPaths,
			pluginEntrypoints
		};
	}

	async function loadDiscoveryData() {
		if (!discoveryCache) {
			discoveryCache = (async () => {
				const rootConfig = await readRootConfigFromDisk();
				const { contentConfigPaths: contentPaths, blockConfigPaths: blockPaths } =
					await getDiscoveryFilePaths(rootConfig);
				const [contentResults, blockResults] = await Promise.all([
					Promise.all(
						contentPaths.map(async (path) => {
							try {
								return {
									config: parseDiscoveredConfig(path, await readFileText(rootHandle, path)),
									issue: null
								};
							} catch (error) {
								return {
									config: null,
									issue: {
										path,
										message:
											error instanceof Error ? error.message : 'Failed to parse content config'
									}
								};
							}
						})
					),
					Promise.all(
						blockPaths.map(async (path) => {
							try {
								return {
									config: parseDiscoveredBlockConfig(path, await readFileText(rootHandle, path)),
									issue: null
								};
							} catch (error) {
								return {
									config: null,
									issue: {
										path,
										message: error instanceof Error ? error.message : 'Failed to parse block config'
									}
								};
							}
						})
					)
				]);
				const configs = normalizeRuntimeDiscoveredConfigIdentity(
					contentResults.flatMap((result) => (result.config ? [result.config] : [])),
					rootConfig
				);
				const blockConfigs = blockResults.flatMap((result) =>
					result.config ? [result.config] : []
				);
				const contentIssues = contentResults.flatMap((result) =>
					result.issue ? [result.issue] : []
				);
				const blockIssues = blockResults.flatMap((result) => (result.issue ? [result.issue] : []));

				for (const issue of [...contentIssues, ...blockIssues]) {
					console.error(issue.message);
				}

				if (configs.length === 0 && contentIssues.length > 0) {
					throw new Error(formatDiscoveryIssue('content config', contentIssues[0]!));
				}

				if (blockConfigs.length === 0 && blockPaths.length > 0 && blockIssues.length > 0) {
					throw new Error(formatDiscoveryIssue('block config', blockIssues[0]!));
				}

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

		getDiscoverySignature,

		async discoverConfigs() {
			const discoveryData = await loadDiscoveryData();
			return discoveryData.configs;
		},

		async discoverBlockConfigs() {
			const discoveryData = await loadDiscoveryData();
			return discoveryData.blockConfigs;
		},

		async readRootConfig(): Promise<RootConfig | null> {
			return readRootConfigFromDisk();
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
