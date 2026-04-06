// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SelectedBackend } from '$lib/repository/selection';
import type {
	GitHubRootConfigSnapshot,
	GitHubUserSnapshot
} from '$lib/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			isAuthenticated: boolean;
			githubToken?: string;
			user?: GitHubUserSnapshot;
			rootConfig?: GitHubRootConfigSnapshot | null;
			selectedRepo?: {
				owner: string;
				name: string;
				full_name: string;
			};
			selectedBackend?: SelectedBackend;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
