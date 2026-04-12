import type { Handle } from '@sveltejs/kit';
import {
	readRecentGitHubRepositories,
	readGitHubSession,
	readSelectedGitHubRepositorySession
} from '$lib/server/auth/github';
import {
	SELECTED_BACKEND_COOKIE,
	SELECTED_LOCAL_REPO_COOKIE,
	type LocalRepositoryIdentity
} from '$lib/repository/selection';

export const handle: Handle = async ({ event, resolve }) => {
	const session = readGitHubSession(event.cookies);

	if (session.token) {
		event.locals.githubToken = session.token;
		event.locals.user = session.user;
	}
	event.locals.isAuthenticated = Boolean(session.token);
	event.locals.rootConfig = readSelectedGitHubRepositorySession(event.cookies).rootConfig;
	event.locals.recentRepos = readRecentGitHubRepositories(event.cookies);

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
