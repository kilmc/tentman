import { get, writable } from 'svelte/store';
import { localRepo } from '$lib/stores/local-repo';
import type { RootConfig } from '$lib/config/root-config';
import type { DiscoveredConfig } from '$lib/types/config';

type LocalContentState = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	configs: DiscoveredConfig[];
	rootConfig: RootConfig | null;
	error: string | null;
};

function createStore() {
	const { subscribe, set, update } = writable<LocalContentState>({
		status: 'idle',
		configs: [],
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
					rootConfig: null,
					error: 'No local repository is open.'
				});
				return;
			}

			update((state) => ({ ...state, status: 'loading', error: null }));

			try {
				const [configs, rootConfig] = await Promise.all([
					repoState.backend.discoverConfigs(),
					repoState.backend.readRootConfig()
				]);

				set({
					status: 'ready',
					configs,
					rootConfig,
					error: null
				});
			} catch (error) {
				set({
					status: 'error',
					configs: [],
					rootConfig: null,
					error: error instanceof Error ? error.message : 'Failed to load local repository content'
				});
			}
		}
	};
}

export const localContent = createStore();
