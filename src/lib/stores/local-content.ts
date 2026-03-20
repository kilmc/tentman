import type { BlockRegistry } from '$lib/blocks/registry';
import { createLoadedBlockRegistry } from '$lib/blocks/registry';
import { get, writable } from 'svelte/store';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import { localRepo } from '$lib/stores/local-repo';
import type { RootConfig } from '$lib/config/root-config';

type LocalContentState = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistry: BlockRegistry | null;
	blockRegistryError: string | null;
	rootConfig: RootConfig | null;
	error: string | null;
};

function createStore() {
	const { subscribe, set, update } = writable<LocalContentState>({
		status: 'idle',
		configs: [],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		error: null
	});

	return {
		subscribe,

		async refresh() {
			let repoState = get(localRepo);
			if (!repoState.backend) {
				await localRepo.hydrate();
				repoState = get(localRepo);
			}

			if (!repoState.backend) {
				set({
					status: 'error',
					configs: [],
					blockConfigs: [],
					blockRegistry: null,
					blockRegistryError: null,
					rootConfig: null,
					error: 'No local repository is open.'
				});
				return;
			}

			update((state) => ({ ...state, status: 'loading', error: null }));

			try {
				const [configs, blockConfigs, rootConfig] = await Promise.all([
					repoState.backend.discoverConfigs(),
					repoState.backend.discoverBlockConfigs(),
					repoState.backend.readRootConfig()
				]);

				let blockRegistry: BlockRegistry | null = null;
				let blockRegistryError: string | null = null;

				try {
					blockRegistry = await createLoadedBlockRegistry(blockConfigs, {
						loadLocalAdapterModule: repoState.backend.loadLocalAdapterModule
					});
				} catch (error) {
					blockRegistryError =
						error instanceof Error ? error.message : 'Failed to load local block adapters';
				}

				set({
					status: 'ready',
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
					configs: [],
					blockConfigs: [],
					blockRegistry: null,
					blockRegistryError: null,
					rootConfig: null,
					error: error instanceof Error ? error.message : 'Failed to load local repository content'
				});
			}
		}
	};
}

export const localContent = createStore();
