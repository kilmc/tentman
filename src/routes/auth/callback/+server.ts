// SERVER_JUSTIFICATION: auth_callback
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '$env/static/private';
import type { GitHubUserSnapshot } from '$lib/auth/session';
import { persistGitHubSession } from '$lib/server/auth/github';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') || '/';

	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	try {
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				client_id: GITHUB_CLIENT_ID,
				client_secret: GITHUB_CLIENT_SECRET,
				code
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
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('OAuth callback error:', err);
		throw error(500, 'Authentication failed');
	}

	// Redirect to the original destination (outside try/catch so redirect isn't caught)
	throw redirect(302, state);
};
