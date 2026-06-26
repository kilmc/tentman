import type { SelectedRepoConfigSummary } from '$lib/auth/session';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';

type WorkspaceStateInput = Partial<{
	isAuthenticated: boolean;
	selectedBackend: SelectedBackend | null;
	selectedRepo: GitHubRepositoryIdentity | null;
	selectedRepoConfigSummary: SelectedRepoConfigSummary | null;
}>;

type NoWorkspaceState = {
	mode: 'none';
	isAuthenticated: boolean;
	selectedBackend: null;
	selectedRepo: null;
	selectedRepoConfigSummary: null;
};

type LocalWorkspaceState = {
	mode: 'local';
	isAuthenticated: boolean;
	selectedBackend: Extract<SelectedBackend, { kind: 'local' }>;
	selectedRepo: null;
	selectedRepoConfigSummary: null;
};

type GitHubWorkspaceState = {
	mode: 'github';
	isAuthenticated: boolean;
	selectedBackend: Extract<SelectedBackend, { kind: 'github' }>;
	selectedRepo: GitHubRepositoryIdentity;
	selectedRepoConfigSummary: SelectedRepoConfigSummary | null;
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
			selectedRepoConfigSummary: null
		};
	}

	if (selectedBackend?.kind === 'github') {
		return {
			mode: 'github',
			isAuthenticated,
			selectedBackend,
			selectedRepo: value?.selectedRepo ?? selectedBackend.repo,
			selectedRepoConfigSummary: value?.selectedRepoConfigSummary ?? null
		};
	}

	return {
		mode: 'none',
		isAuthenticated,
		selectedBackend: null,
		selectedRepo: null,
		selectedRepoConfigSummary: null
	};
}
