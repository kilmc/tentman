import type { RootConfig } from '$lib/config/root-config';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';

export interface GitHubUserSnapshot {
	login: string;
	name: string | null;
	avatar_url: string;
	email: string | null;
}

export interface GitHubRootConfigSnapshot {
	siteName?: RootConfig['siteName'];
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
	rootConfig: GitHubRootConfigSnapshot | null;
	recentRepos: RecentGitHubRepositorySnapshot[];
}

export const EMPTY_SESSION_BOOTSTRAP: SessionBootstrap = {
	isAuthenticated: false,
	githubOAuthConfigured: false,
	user: null,
	selectedRepo: null,
	selectedBackend: null,
	rootConfig: null,
	recentRepos: []
};

export function normalizeSessionBootstrap(
	value: Partial<SessionBootstrap> | null | undefined
): SessionBootstrap {
	return {
		isAuthenticated: value?.isAuthenticated ?? false,
		githubOAuthConfigured: value?.githubOAuthConfigured ?? false,
		user: value?.user ?? null,
		selectedRepo: value?.selectedRepo ?? null,
		selectedBackend: value?.selectedBackend ?? null,
		rootConfig: value?.rootConfig ?? null,
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
