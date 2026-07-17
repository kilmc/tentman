// SERVER_JUSTIFICATION: auth_callback
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GitHubUserSnapshot } from '$lib/auth/session';
import {
	clearGitHubOAuthRequest,
	getGitHubOAuthCallbackRelayUrl,
	getGitHubOAuthCallbackUrl,
	getGitHubOAuthCredentials,
	getGitHubOAuthStateFingerprint,
	logGitHubOAuthDebug,
	persistGitHubSession,
	readGitHubOAuthRequest
} from '$lib/server/auth/github';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');
	const callbackUrl = getGitHubOAuthCallbackUrl(url);
	const callbackOrigin = new URL(callbackUrl).origin;
	const callbackPath = new URL(callbackUrl).pathname;
	logGitHubOAuthDebug('callback.received', {
		requestOrigin: url.origin,
		callbackOrigin,
		callbackPath,
		hasCode: Boolean(code),
		hasReturnedState: Boolean(returnedState),
		returnedStateFingerprint: getGitHubOAuthStateFingerprint(returnedState)
	});

	const relayUrl = getGitHubOAuthCallbackRelayUrl({
		callbackUrl,
		currentUrl: url,
		state: returnedState
	});

	if (relayUrl) {
		logGitHubOAuthDebug('callback.relay', {
			requestOrigin: url.origin,
			relayOrigin: relayUrl.origin,
			relayPath: relayUrl.pathname,
			returnedStateFingerprint: getGitHubOAuthStateFingerprint(returnedState)
		});
		throw redirect(302, relayUrl.toString());
	}

	const { state: storedState, redirectTo } = readGitHubOAuthRequest(cookies);
	const stateMatches = Boolean(returnedState && storedState && returnedState === storedState);
	logGitHubOAuthDebug('callback.state_check', {
		requestOrigin: url.origin,
		hasStoredState: Boolean(storedState),
		hasReturnedState: Boolean(returnedState),
		stateMatches,
		storedStateFingerprint: getGitHubOAuthStateFingerprint(storedState),
		returnedStateFingerprint: getGitHubOAuthStateFingerprint(returnedState),
		redirectTo
	});

	if (!code) {
		logGitHubOAuthDebug('callback.missing_code', {
			requestOrigin: url.origin,
			returnedStateFingerprint: getGitHubOAuthStateFingerprint(returnedState)
		});
		throw error(400, 'Missing authorization code');
	}

	if (!stateMatches) {
		logGitHubOAuthDebug('callback.invalid_state', {
			requestOrigin: url.origin,
			hasStoredState: Boolean(storedState),
			hasReturnedState: Boolean(returnedState),
			storedStateFingerprint: getGitHubOAuthStateFingerprint(storedState),
			returnedStateFingerprint: getGitHubOAuthStateFingerprint(returnedState)
		});
		clearGitHubOAuthRequest(cookies);
		throw error(400, 'Invalid OAuth state');
	}

	try {
		const { clientId, clientSecret } = getGitHubOAuthCredentials();
		logGitHubOAuthDebug('callback.token_exchange_start', {
			requestOrigin: url.origin,
			callbackOrigin,
			callbackPath,
			clientIdPresent: Boolean(clientId)
		});
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: callbackUrl
			})
		});

		const tokenData = await tokenResponse.json();
		logGitHubOAuthDebug('callback.token_exchange_response', {
			requestOrigin: url.origin,
			status: tokenResponse.status,
			ok: tokenResponse.ok,
			hasAccessToken: Boolean(tokenData.access_token),
			tokenError: typeof tokenData.error === 'string' ? tokenData.error : null
		});

		if (tokenData.error || !tokenData.access_token) {
			throw error(400, tokenData.error_description || 'Failed to get access token');
		}

		const userResponse = await fetch('https://api.github.com/user', {
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${tokenData.access_token}`,
				'User-Agent': 'Tentman'
			}
		});
		logGitHubOAuthDebug('callback.user_response', {
			requestOrigin: url.origin,
			status: userResponse.status,
			ok: userResponse.ok
		});

		if (!userResponse.ok) {
			throw error(400, 'Failed to load GitHub user profile');
		}

		const userData = await userResponse.json();
		const user: GitHubUserSnapshot = {
			login: userData.login,
			name: userData.name ?? null,
			avatar_url: userData.avatar_url,
			email: userData.email ?? null
		};

		persistGitHubSession(cookies, {
			token: tokenData.access_token,
			user
		});
		clearGitHubOAuthRequest(cookies);
		logGitHubOAuthDebug('callback.success', {
			requestOrigin: url.origin,
			redirectTo,
			userLoginPresent: Boolean(user.login)
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			logGitHubOAuthDebug('callback.http_error', {
				requestOrigin: url.origin,
				status: typeof err.status === 'number' ? err.status : null
			});
			throw err;
		}

		clearGitHubOAuthRequest(cookies);
		logGitHubOAuthDebug('callback.exception', {
			requestOrigin: url.origin,
			message: err instanceof Error ? err.message : String(err)
		});
		console.error('OAuth callback error:', err);
		throw error(500, 'Authentication failed');
	}

	// Redirect to the original destination (outside try/catch so redirect isn't caught)
	throw redirect(302, redirectTo);
};
