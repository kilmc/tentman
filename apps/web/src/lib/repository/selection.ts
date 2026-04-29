import type { GitHubRepositoryIdentity } from '$lib/repository/github';

export const SELECTED_BACKEND_COOKIE = 'selected_backend_kind';
export const SELECTED_LOCAL_REPO_COOKIE = 'selected_local_repo';

export interface LocalRepositoryIdentity {
	name: string;
	pathLabel: string;
}

export type SelectedBackend =
	| {
			kind: 'github';
			repo: GitHubRepositoryIdentity;
	  }
	| {
			kind: 'local';
			repo: LocalRepositoryIdentity;
	  };
