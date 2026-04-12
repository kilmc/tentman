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
	const selectedBackendKind = event.cookies.get(SELECTED_BACKEND_COOKIE);
	const githubRepoSession = readSelectedGitHubRepositorySession(event.cookies);

	if (session.token) {
		event.locals.githubToken = session.token;
		event.locals.user = session.user;
	}
	event.locals.isAuthenticated = Boolean(session.token);
	event.locals.recentRepos = readRecentGitHubRepositories(event.cookies);

	let selectedGitHubRepo: App.Locals['selectedRepo'];
	const selectedRepo = event.cookies.get('selected_repo');
	if (selectedRepo) {
		try {
			selectedGitHubRepo = JSON.parse(selectedRepo);
		} catch {
			// Invalid JSON, ignore
		}
	}

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
	} else if (selectedGitHubRepo && (selectedBackendKind === 'github' || !selectedBackendKind)) {
		event.locals.selectedRepo = selectedGitHubRepo;
		event.locals.selectedBackend = {
			kind: 'github',
			repo: selectedGitHubRepo
		};
		event.locals.rootConfig = githubRepoSession.rootConfig;
	}

	return resolve(event);
};
