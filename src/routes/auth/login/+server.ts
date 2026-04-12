// SERVER_JUSTIFICATION: session
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createGitHubOAuthState,
	getGitHubClientId,
	hasRecentGitHubLoginAttempt,
	isGitHubOAuthConfigured,
	markGitHubLoginAttempt,
	persistGitHubOAuthRequest
} from '$lib/server/auth/github';
import { sanitizeAuthRedirectTarget } from '$lib/utils/routing';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const redirectTo = sanitizeAuthRedirectTarget(url.searchParams.get('redirect'), '/repos');
	const callbackUrl = new URL('/auth/callback', url).toString();
	const state = createGitHubOAuthState();

	if (!isGitHubOAuthConfigured()) {
		throw redirect(302, '/?github_oauth=unavailable');
	}

	if (hasRecentGitHubLoginAttempt(cookies)) {
		throw redirect(302, '/?github_oauth=retry_later');
	}

	// GitHub OAuth authorization URL
	const authUrl = new URL('https://github.com/login/oauth/authorize');
	authUrl.searchParams.set('client_id', getGitHubClientId());
	authUrl.searchParams.set('redirect_uri', callbackUrl);
	authUrl.searchParams.set('scope', 'repo'); // Request repo access for reading/writing content
	authUrl.searchParams.set('state', state);
	persistGitHubOAuthRequest(cookies, { state, redirectTo });
	markGitHubLoginAttempt(cookies);

	throw redirect(302, authUrl.toString());
};
