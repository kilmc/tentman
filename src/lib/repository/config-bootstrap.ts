import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';

export interface RepoConfigsBootstrap {
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
}

export const EMPTY_REPO_CONFIGS_BOOTSTRAP: RepoConfigsBootstrap = {
	configs: [],
	blockConfigs: [],
	rootConfig: null
};

export function normalizeRepoConfigsBootstrap(
	value: Partial<RepoConfigsBootstrap> | null | undefined
): RepoConfigsBootstrap {
	return {
		configs: value?.configs ?? [],
		blockConfigs: value?.blockConfigs ?? [],
		rootConfig: value?.rootConfig ?? null
	};
}

export async function loadRepoConfigsBootstrap(
	fetcher: typeof fetch
): Promise<RepoConfigsBootstrap> {
	const response = await fetcher('/api/repo/configs');

	if (!response.ok) {
		const error = new Error(
			`Failed to load repo configs bootstrap (${response.status})`
		) as Error & {
			status?: number;
		};
		error.status = response.status;
		throw error;
	}

	return normalizeRepoConfigsBootstrap((await response.json()) as Partial<RepoConfigsBootstrap>);
}
