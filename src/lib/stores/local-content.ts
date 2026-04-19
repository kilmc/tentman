import type { BlockRegistry } from '$lib/blocks/registry';
import { createLoadedBlockRegistry } from '$lib/blocks/registry';
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
import type { RootConfig } from '$lib/config/root-config';

type LocalContentState = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	backendKey: string | null;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistry: BlockRegistry | null;
	blockRegistryError: string | null;
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	instructionDiscovery: InstructionDiscoveryResult;
	error: string | null;
};

function createStore() {
	const store = writable<LocalContentState>({
		status: 'idle',
		backendKey: null,
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
			let repoState = get(localRepo);
			if (!repoState.backend) {
				await localRepo.hydrate();
				repoState = get(localRepo);
			}

			if (!repoState.backend) {
				set({
					status: 'error',
					backendKey: null,
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

			const currentState = get(store);
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

			inFlightRefresh = (async () => {
				try {
					const [configs, blockConfigs, rootConfig, navigationManifest, instructionDiscovery] =
						await Promise.all([
							backend.discoverConfigs(),
							backend.discoverBlockConfigs(),
							backend.readRootConfig(),
							loadNavigationManifestState(backend),
							discoverInstructions(backend)
						]);

					let blockRegistry: BlockRegistry | null = null;
					let blockRegistryError: string | null = null;

					if ((rootConfig?.blockPackages?.length ?? 0) > 0) {
						blockRegistryError =
							'Package-distributed blocks are not supported in local browser-backed mode yet. Remove root.blockPackages or switch to the GitHub-backed/server mode for now.';
					} else {
						try {
							blockRegistry = await createLoadedBlockRegistry(blockConfigs, {
								loadLocalAdapterModule: backend.loadLocalAdapterModule
							});
						} catch (error) {
							blockRegistryError =
								error instanceof Error ? error.message : 'Failed to load local block adapters';
						}
					}

					set({
						status: 'ready',
						backendKey: backend.cacheKey,
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
