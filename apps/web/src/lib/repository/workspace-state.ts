import type { GitHubRootConfigSnapshot } from '$lib/auth/session';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';

type WorkspaceStateInput = Partial<{
	isAuthenticated: boolean;
	selectedBackend: SelectedBackend | null;
	selectedRepo: GitHubRepositoryIdentity | null;
	rootConfig: GitHubRootConfigSnapshot | null;
}>;

type NoWorkspaceState = {
	mode: 'none';
	isAuthenticated: boolean;
	selectedBackend: null;
	selectedRepo: null;
	rootConfig: null;
};

type LocalWorkspaceState = {
	mode: 'local';
	isAuthenticated: boolean;
	selectedBackend: Extract<SelectedBackend, { kind: 'local' }>;
	selectedRepo: null;
	rootConfig: null;
};

type GitHubWorkspaceState = {
	mode: 'github';
	isAuthenticated: boolean;
	selectedBackend: Extract<SelectedBackend, { kind: 'github' }>;
	selectedRepo: GitHubRepositoryIdentity;
	rootConfig: GitHubRootConfigSnapshot | null;
};

export type WorkspaceState = NoWorkspaceState | LocalWorkspaceState | GitHubWorkspaceState;

export function resolveWorkspaceState(
	value: WorkspaceStateInput | null | undefined
): WorkspaceState {
	const isAuthenticated = value?.isAuthenticated ?? false;
	const selectedBackend = value?.selectedBackend ?? null;

	if (selectedBackend?.kind === 'local') {
		return {
			mode: 'local',
			isAuthenticated,
			selectedBackend,
			selectedRepo: null,
			rootConfig: null
		};
	}

	if (selectedBackend?.kind === 'github') {
		return {
			mode: 'github',
			isAuthenticated,
			selectedBackend,
			selectedRepo: value?.selectedRepo ?? selectedBackend.repo,
			rootConfig: value?.rootConfig ?? null
		};
	}

	return {
		mode: 'none',
		isAuthenticated,
		selectedBackend: null,
		selectedRepo: null,
		rootConfig: null
	};
}
