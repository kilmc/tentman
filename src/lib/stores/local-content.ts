import type { BlockRegistry } from '$lib/blocks/registry';
import { createLoadedBlockRegistry } from '$lib/blocks/registry';
import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import {
	loadNavigationManifestState,
	type NavigationManifestState
} from '$lib/features/content-management/navigation-manifest';
import { clearPluginRegistryCache } from '$lib/plugins/browser';
import { localRepo } from '$lib/stores/local-repo';
import { shouldUseLocalConfigCache, type RootConfig } from '$lib/config/root-config';

type LocalContentState = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	backendKey: string | null;
	revision: number;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistry: BlockRegistry | null;
	blockRegistryError: string | null;
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	instructionDiscovery: InstructionDiscoveryResult;
	error: string | null;
};

type PersistedLocalContentState = {
	version: 1;
	backendKey: string;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	instructionDiscovery: InstructionDiscoveryResult;
};

const LOCAL_CONTENT_CACHE_PREFIX = 'tentman:local-content:';

function getPersistedStateKey(backendKey: string) {
	return `${LOCAL_CONTENT_CACHE_PREFIX}${backendKey}`;
}

function readPersistedState(backendKey: string): PersistedLocalContentState | null {
	if (!browser) {
		return null;
	}

	try {
		const raw = localStorage.getItem(getPersistedStateKey(backendKey));
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw) as PersistedLocalContentState;
		if (parsed.version !== 1 || parsed.backendKey !== backendKey) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function writePersistedState(state: PersistedLocalContentState) {
	if (!browser) {
		return;
	}

	try {
		localStorage.setItem(getPersistedStateKey(state.backendKey), JSON.stringify(state));
	} catch {
		// Ignore storage quota and serialization failures; the live state still works.
	}
}

function clearPersistedState(backendKey: string) {
	if (!browser) {
		return;
	}

	try {
		localStorage.removeItem(getPersistedStateKey(backendKey));
	} catch {
		// Ignore storage failures.
	}
}

async function loadBlockRegistry(
	blockConfigs: DiscoveredBlockConfig[],
	rootConfig: RootConfig | null,
	loadLocalAdapterModule: (path: string) => Promise<unknown>
): Promise<{ blockRegistry: BlockRegistry | null; blockRegistryError: string | null }> {
	if ((rootConfig?.blockPackages?.length ?? 0) > 0) {
		return {
			blockRegistry: null,
			blockRegistryError:
				'Package-distributed blocks are not supported in local browser-backed mode yet. Remove root.blockPackages or switch to the GitHub-backed/server mode for now.'
		};
	}

	try {
		return {
			blockRegistry: await createLoadedBlockRegistry(blockConfigs, {
				loadLocalAdapterModule
			}),
			blockRegistryError: null
		};
	} catch (error) {
		return {
			blockRegistry: null,
			blockRegistryError:
				error instanceof Error ? error.message : 'Failed to load local block adapters'
		};
	}
}

function createStore() {
	const store = writable<LocalContentState>({
		status: 'idle',
		backendKey: null,
		revision: 0,
		configs: [],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		},
		error: null
	});
	const { subscribe, set, update } = store;
	let inFlightRefresh: Promise<void> | null = null;

	return {
		subscribe,

		async refresh(options: { force?: boolean } = {}) {
			const currentState = get(store);
			let repoState = get(localRepo);
			if (!repoState.backend) {
				await localRepo.hydrate();
				repoState = get(localRepo);
			}

			if (!repoState.backend) {
				set({
					status: 'error',
					backendKey: null,
					revision: currentState.revision,
					configs: [],
					blockConfigs: [],
					blockRegistry: null,
					blockRegistryError: null,
					rootConfig: null,
					navigationManifest: {
						path: 'tentman/navigation-manifest.json',
						exists: false,
						manifest: null,
						error: null
					},
					instructionDiscovery: {
						instructions: [],
						issues: []
					},
					error: 'No local repository is open.'
				});
				return;
			}

			const backend = repoState.backend;
			const rootConfig = await backend.readRootConfig();
			const shouldUsePersistedCache = shouldUseLocalConfigCache(rootConfig);
			if (
				!options.force &&
				currentState.status === 'ready' &&
				currentState.backendKey === backend.cacheKey
			) {
				return;
			}

			if (
				!options.force &&
				currentState.status === 'loading' &&
				currentState.backendKey === backend.cacheKey &&
				inFlightRefresh
			) {
				await inFlightRefresh;
				return;
			}

			if (options.force) {
				backend.invalidateDiscoveryCache();
				clearPluginRegistryCache();
				clearPersistedState(backend.cacheKey);
			}

			if (!shouldUsePersistedCache) {
				clearPersistedState(backend.cacheKey);
			}

			const shouldClearForRepoChange =
				currentState.backendKey !== null && currentState.backendKey !== backend.cacheKey;

			if (shouldClearForRepoChange) {
				clearPluginRegistryCache();
			}

			update((state) => ({
				...state,
				status: 'loading',
				backendKey: shouldClearForRepoChange ? backend.cacheKey : state.backendKey,
				configs: shouldClearForRepoChange ? [] : state.configs,
				blockConfigs: shouldClearForRepoChange ? [] : state.blockConfigs,
				blockRegistry: shouldClearForRepoChange ? null : state.blockRegistry,
				blockRegistryError: shouldClearForRepoChange ? null : state.blockRegistryError,
				rootConfig: shouldClearForRepoChange ? null : state.rootConfig,
				navigationManifest: shouldClearForRepoChange
					? {
							path: 'tentman/navigation-manifest.json',
							exists: false,
							manifest: null,
							error: null
						}
					: state.navigationManifest,
				instructionDiscovery: shouldClearForRepoChange
					? {
							instructions: [],
							issues: []
						}
					: state.instructionDiscovery,
				error: null
			}));

			if (!options.force && shouldUsePersistedCache) {
				const persistedState = readPersistedState(backend.cacheKey);
				if (persistedState) {
					const { blockRegistry, blockRegistryError } = await loadBlockRegistry(
						persistedState.blockConfigs,
						persistedState.rootConfig,
						backend.loadLocalAdapterModule
					);

					set({
						status: 'ready',
						backendKey: persistedState.backendKey,
						revision: currentState.revision + 1,
						configs: persistedState.configs,
						blockConfigs: persistedState.blockConfigs,
						blockRegistry,
						blockRegistryError,
						rootConfig: persistedState.rootConfig,
						navigationManifest: persistedState.navigationManifest,
						instructionDiscovery: persistedState.instructionDiscovery,
						error: null
					});
					return;
				}
			}

			inFlightRefresh = (async () => {
				try {
					const [configs, blockConfigs, navigationManifest, instructionDiscovery] =
						await Promise.all([
							backend.discoverConfigs(),
							backend.discoverBlockConfigs(),
							loadNavigationManifestState(backend),
							discoverInstructions(backend)
						]);

					const { blockRegistry, blockRegistryError } = await loadBlockRegistry(
						blockConfigs,
						rootConfig,
						backend.loadLocalAdapterModule
					);

					if (shouldUsePersistedCache) {
						writePersistedState({
							version: 1,
							backendKey: backend.cacheKey,
							configs,
							blockConfigs,
							rootConfig,
							navigationManifest,
							instructionDiscovery
						});
					}

					set({
						status: 'ready',
						backendKey: backend.cacheKey,
						revision: currentState.revision + 1,
						configs,
						blockConfigs,
						blockRegistry,
						blockRegistryError,
						rootConfig,
						navigationManifest,
						instructionDiscovery,
						error: null
					});
				} catch (error) {
					set({
						status: 'error',
						backendKey: backend.cacheKey,
						revision: currentState.revision,
						configs: [],
						blockConfigs: [],
						blockRegistry: null,
						blockRegistryError: null,
						rootConfig: null,
						navigationManifest: {
							path: 'tentman/navigation-manifest.json',
							exists: false,
							manifest: null,
							error: null
						},
						instructionDiscovery: {
							instructions: [],
							issues: []
						},
						error:
							error instanceof Error ? error.message : 'Failed to load local repository content'
					});
				} finally {
					inFlightRefresh = null;
				}
			})();

			await inFlightRefresh;
		},

		reset() {
			inFlightRefresh = null;
			set({
				status: 'idle',
				backendKey: null,
				revision: 0,
				configs: [],
				blockConfigs: [],
				blockRegistry: null,
				blockRegistryError: null,
				rootConfig: null,
				navigationManifest: {
					path: 'tentman/navigation-manifest.json',
					exists: false,
					manifest: null,
					error: null
				},
				instructionDiscovery: {
					instructions: [],
					issues: []
				},
				error: null
			});
		}
	};
}

export const localContent = createStore();
