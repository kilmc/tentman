import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { WorkflowWorkspaceBootstrapData } from '$lib/repository/workflow-data';

export interface RepoBootstrapIdentity {
	mode: string;
	repoKey: string;
	label: string;
	ref: string;
	headSha: string;
	treeSha: string;
	resolvedAt: number;
}

export interface RepoSingletonContentIdentity {
	path: string;
	blobSha: string;
}

export interface RepoConfigsBootstrap {
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	singletonContentIdentities: Record<string, RepoSingletonContentIdentity>;
	activeDraftBranch: string | null;
	repositoryIdentity?: RepoBootstrapIdentity | null;
	mainRepositoryIdentity?: RepoBootstrapIdentity | null;
	draftRepositoryIdentity?: RepoBootstrapIdentity | null;
	changedPaths?: string[] | null;
	freshnessStatus?: 'unchanged' | 'changed' | 'stale' | 'error';
	freshnessError?: string | null;
	freshnessRecovery?: string | null;
	workflowData?: WorkflowWorkspaceBootstrapData | null;
}

export interface RepoFreshnessIdentityResult {
	activeDraftBranch: string | null;
	repositoryIdentity: RepoBootstrapIdentity | null;
	mainRepositoryIdentity: RepoBootstrapIdentity | null;
	draftRepositoryIdentity: RepoBootstrapIdentity | null;
	unchanged: boolean;
	freshnessStatus?: 'unchanged' | 'changed' | 'stale' | 'error';
	changedPaths?: string[] | null;
	error?: string | null;
	recovery?: string | null;
}

export const EMPTY_REPO_CONFIGS_BOOTSTRAP: RepoConfigsBootstrap = {
	configs: [],
	blockConfigs: [],
	rootConfig: null,
	singletonContentIdentities: {},
	activeDraftBranch: null,
	repositoryIdentity: null,
	mainRepositoryIdentity: null,
	draftRepositoryIdentity: null,
	changedPaths: null,
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
		singletonContentIdentities: value?.singletonContentIdentities ?? {},
		activeDraftBranch: value?.activeDraftBranch ?? null,
		repositoryIdentity: value?.repositoryIdentity ?? null,
		mainRepositoryIdentity: value?.mainRepositoryIdentity ?? null,
		draftRepositoryIdentity: value?.draftRepositoryIdentity ?? null,
		changedPaths: value?.changedPaths ?? null,
		navigationManifest: value?.navigationManifest ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
		...(value?.freshnessStatus ? { freshnessStatus: value.freshnessStatus } : {}),
		...(value?.freshnessError ? { freshnessError: value.freshnessError } : {}),
		...(value?.freshnessRecovery ? { freshnessRecovery: value.freshnessRecovery } : {}),
		...(value?.workflowData ? { workflowData: value.workflowData } : {})
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
