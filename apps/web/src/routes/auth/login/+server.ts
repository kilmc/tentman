// SERVER_JUSTIFICATION: session
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createGitHubOAuthState,
	getGitHubOAuthCallbackUrl,
	getGitHubClientId,
	hasRecentGitHubLoginAttempt,
	isGitHubOAuthConfigured,
	markGitHubLoginAttempt,
	persistGitHubOAuthRequest
} from '$lib/server/auth/github';
import { sanitizeAuthRedirectTarget } from '$lib/utils/routing';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const redirectTo = sanitizeAuthRedirectTarget(url.searchParams.get('redirect'), '/repos');

	if (!isGitHubOAuthConfigured()) {
		throw redirect(302, '/?github_oauth=unavailable');
	}

	if (hasRecentGitHubLoginAttempt(cookies)) {
		throw redirect(302, '/?github_oauth=retry_later');
	}

	const callbackUrl = getGitHubOAuthCallbackUrl(url);
	const state = createGitHubOAuthState(
		new URL(callbackUrl).origin === url.origin ? {} : { returnOrigin: url.origin }
	);

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
