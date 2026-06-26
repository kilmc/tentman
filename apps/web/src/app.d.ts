// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SelectedBackend } from '$lib/repository/selection';
import type {
	RecentGitHubRepositorySnapshot,
	SelectedRepoConfigSummary,
	GitHubUserSnapshot
} from '$lib/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			isAuthenticated: boolean;
			githubToken?: string;
			user?: GitHubUserSnapshot;
			selectedRepoConfigSummary?: SelectedRepoConfigSummary | null;
			recentRepos?: RecentGitHubRepositorySnapshot[];
			selectedRepo?: {
				owner: string;
				name: string;
				full_name: string;
				default_branch: string;
			};
			selectedBackend?: SelectedBackend;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
