import type { BlockRegistry } from '$lib/blocks/registry';
import { createLoadedBlockRegistry } from '$lib/blocks/registry';
import { get, writable } from 'svelte/store';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
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
			}

			const shouldClearForRepoChange =
				currentState.backendKey !== null && currentState.backendKey !== backend.cacheKey;

			update((state) => ({
				...state,
				status: 'loading',
				backendKey: shouldClearForRepoChange ? backend.cacheKey : state.backendKey,
				configs: shouldClearForRepoChange ? [] : state.configs,
				blockConfigs: shouldClearForRepoChange ? [] : state.blockConfigs,
				blockRegistry: shouldClearForRepoChange ? null : state.blockRegistry,
				blockRegistryError: shouldClearForRepoChange ? null : state.blockRegistryError,
				rootConfig: shouldClearForRepoChange ? null : state.rootConfig,
				error: null
			}));

			inFlightRefresh = (async () => {
				try {
					const [configs, blockConfigs, rootConfig] = await Promise.all([
						backend.discoverConfigs(),
						backend.discoverBlockConfigs(),
						backend.readRootConfig()
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
				error: null
			});
		}
	};
}

export const localContent = createStore();
