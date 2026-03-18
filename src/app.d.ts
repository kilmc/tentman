// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Octokit } from 'octokit';
import type { SelectedBackend } from '$lib/repository/selection';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			isAuthenticated: boolean;
			user?: {
				login: string;
				name: string | null;
				avatar_url: string;
				email: string | null;
			};
			octokit?: Octokit;
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
