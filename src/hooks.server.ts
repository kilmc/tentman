import type { Handle } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import {
	SELECTED_BACKEND_COOKIE,
	SELECTED_LOCAL_REPO_COOKIE,
	type LocalRepositoryIdentity
} from '$lib/repository/selection';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('github_token');

	if (token) {
		// Create an authenticated Octokit instance
		const octokit = new Octokit({ auth: token });

		try {
			// Fetch the authenticated user's info
			const { data: user } = await octokit.rest.users.getAuthenticated();

			// Store user info and octokit instance in locals for easy access
			event.locals.user = user;
			event.locals.octokit = octokit;
			event.locals.isAuthenticated = true;
		} catch (err) {
			// Token is invalid or expired, clear it
			console.error('Invalid GitHub token:', err);
			event.cookies.delete('github_token', { path: '/' });
			event.locals.isAuthenticated = false;
		}
	} else {
		event.locals.isAuthenticated = false;
	}

	// Get selected repository from cookie
	const selectedRepo = event.cookies.get('selected_repo');
	if (selectedRepo) {
		try {
			event.locals.selectedRepo = JSON.parse(selectedRepo);
		} catch {
			// Invalid JSON, ignore
		}
	}

	const selectedBackendKind = event.cookies.get(SELECTED_BACKEND_COOKIE);
	if (selectedBackendKind === 'local') {
		const localRepo = event.cookies.get(SELECTED_LOCAL_REPO_COOKIE);
		if (localRepo) {
			try {
				event.locals.selectedBackend = {
					kind: 'local',
					repo: JSON.parse(localRepo) as LocalRepositoryIdentity
				};
			} catch {
				// Ignore invalid local repo metadata.
			}
		}
	} else if (event.locals.selectedRepo) {
		event.locals.selectedBackend = {
			kind: 'github',
			repo: event.locals.selectedRepo
		};
	}

	return resolve(event);
};
