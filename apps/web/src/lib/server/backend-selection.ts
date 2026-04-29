import type { Cookies } from '@sveltejs/kit';
import {
	GITHUB_REPO_SESSION_COOKIE,
	SELECTED_REPO_COOKIE,
	getGitHubCookieOptions
} from '$lib/server/auth/github';
import {
	SELECTED_BACKEND_COOKIE,
	SELECTED_LOCAL_REPO_COOKIE,
	type LocalRepositoryIdentity
} from '$lib/repository/selection';

export function clearActiveBackendSelection(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(SELECTED_BACKEND_COOKIE, { path: '/' });
	cookies.delete(SELECTED_LOCAL_REPO_COOKIE, { path: '/' });
	cookies.delete(SELECTED_REPO_COOKIE, { path: '/' });
	cookies.delete(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
}

export function persistLocalBackendSelection(
	cookies: Pick<Cookies, 'set' | 'delete'>,
	repo: LocalRepositoryIdentity
): void {
	clearActiveBackendSelection(cookies);

	const options = getGitHubCookieOptions();
	cookies.set(SELECTED_BACKEND_COOKIE, 'local', options);
	cookies.set(SELECTED_LOCAL_REPO_COOKIE, JSON.stringify(repo), options);
}
