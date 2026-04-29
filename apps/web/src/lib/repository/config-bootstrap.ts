import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';

export interface RepoConfigsBootstrap {
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
}

export const EMPTY_REPO_CONFIGS_BOOTSTRAP: RepoConfigsBootstrap = {
	configs: [],
	blockConfigs: [],
	rootConfig: null,
	navigationManifest: {
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	}
};

export function normalizeRepoConfigsBootstrap(
	value: Partial<RepoConfigsBootstrap> | null | undefined
): RepoConfigsBootstrap {
	return {
		configs: value?.configs ?? [],
		blockConfigs: value?.blockConfigs ?? [],
		rootConfig: value?.rootConfig ?? null,
		navigationManifest: value?.navigationManifest ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
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
