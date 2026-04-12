// SERVER_JUSTIFICATION: auth_callback
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GitHubUserSnapshot } from '$lib/auth/session';
import {
	clearGitHubOAuthRequest,
	getGitHubOAuthCredentials,
	persistGitHubSession,
	readGitHubOAuthRequest
} from '$lib/server/auth/github';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');
	const { state: storedState, redirectTo } = readGitHubOAuthRequest(cookies);
	const callbackUrl = new URL('/auth/callback', url).toString();

	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	if (!returnedState || !storedState || returnedState !== storedState) {
		clearGitHubOAuthRequest(cookies);
		throw error(400, 'Invalid OAuth state');
	}

	try {
		const { clientId, clientSecret } = getGitHubOAuthCredentials();
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
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		clearGitHubOAuthRequest(cookies);
		console.error('OAuth callback error:', err);
		throw error(500, 'Authentication failed');
	}

	// Redirect to the original destination (outside try/catch so redirect isn't caught)
	throw redirect(302, redirectTo);
};
