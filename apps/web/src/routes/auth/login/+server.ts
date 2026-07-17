// SERVER_JUSTIFICATION: session
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createGitHubOAuthState,
	getGitHubOAuthCallbackUrl,
	getGitHubClientId,
	getGitHubOAuthStateFingerprint,
	hasRecentGitHubLoginAttempt,
	isGitHubOAuthConfigured,
	logGitHubOAuthDebug,
	markGitHubLoginAttempt,
	persistGitHubOAuthRequest
} from '$lib/server/auth/github';
import { sanitizeAuthRedirectTarget } from '$lib/utils/routing';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const redirectTo = sanitizeAuthRedirectTarget(url.searchParams.get('redirect'), '/repos');
	const oauthConfigured = isGitHubOAuthConfigured();

	if (!oauthConfigured) {
		logGitHubOAuthDebug('login.unavailable', {
			requestOrigin: url.origin,
			redirectTo
		});
		throw redirect(302, '/?github_oauth=unavailable');
	}

	if (hasRecentGitHubLoginAttempt(cookies)) {
		logGitHubOAuthDebug('login.cooldown', {
			requestOrigin: url.origin,
			redirectTo
		});
		throw redirect(302, '/?github_oauth=retry_later');
	}

	const callbackUrl = getGitHubOAuthCallbackUrl(url);
	const callbackOrigin = new URL(callbackUrl).origin;
	const state = createGitHubOAuthState(
		callbackOrigin === url.origin ? {} : { returnOrigin: url.origin }
	);
	logGitHubOAuthDebug('login.start', {
		requestOrigin: url.origin,
		callbackOrigin,
		callbackPath: new URL(callbackUrl).pathname,
		usesRelayState: callbackOrigin !== url.origin,
		stateFingerprint: getGitHubOAuthStateFingerprint(state),
		redirectTo
	});

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
