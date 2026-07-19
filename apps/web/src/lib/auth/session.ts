import type { RootConfig } from '$lib/config/root-config';
import type { RepoBootstrapIdentity } from '$lib/repository/config-bootstrap';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';

export interface GitHubUserSnapshot {
	login: string;
	name: string | null;
	avatar_url: string;
	email: string | null;
}

export interface SelectedRepoConfigSummary {
	siteName?: RootConfig['siteName'];
	componentsDir?: RootConfig['componentsDir'];
	netlify?: RootConfig['netlify'];
	repositoryIdentity?: RepoBootstrapIdentity | null;
}

export interface RecentGitHubRepositorySnapshot extends GitHubRepositoryIdentity {
	openedAt: string;
}

export interface SessionBootstrap {
	isAuthenticated: boolean;
	githubOAuthConfigured: boolean;
	user: GitHubUserSnapshot | null;
	selectedRepo: GitHubRepositoryIdentity | null;
	selectedBackend: SelectedBackend | null;
	selectedRepoConfigSummary: SelectedRepoConfigSummary | null;
	recentRepos: RecentGitHubRepositorySnapshot[];
}

type LegacySessionBootstrap = Partial<SessionBootstrap> & {
	rootConfig?: SelectedRepoConfigSummary | null;
};

export const EMPTY_SESSION_BOOTSTRAP: SessionBootstrap = {
	isAuthenticated: false,
	githubOAuthConfigured: false,
	user: null,
	selectedRepo: null,
	selectedBackend: null,
	selectedRepoConfigSummary: null,
	recentRepos: []
};

export function normalizeSessionBootstrap(
	value: Partial<SessionBootstrap> | null | undefined
): SessionBootstrap {
	const legacyValue = value as LegacySessionBootstrap | null | undefined;

	return {
		isAuthenticated: value?.isAuthenticated ?? false,
		githubOAuthConfigured: value?.githubOAuthConfigured ?? false,
		user: value?.user ?? null,
		selectedRepo: value?.selectedRepo ?? null,
		selectedBackend: value?.selectedBackend ?? null,
		selectedRepoConfigSummary:
			value?.selectedRepoConfigSummary ?? legacyValue?.rootConfig ?? null,
		recentRepos: value?.recentRepos ?? []
	};
}

export async function loadSessionBootstrap(fetcher: typeof fetch): Promise<SessionBootstrap> {
	const response = await fetcher('/api/session');

	if (!response.ok) {
		throw new Error(`Failed to load session bootstrap (${response.status})`);
	}

	return normalizeSessionBootstrap((await response.json()) as Partial<SessionBootstrap>);
}
