import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '$env/static/private';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') || '/';

	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	try {
		// Log for debugging
		console.log('[OAuth] Starting token exchange...');
		console.log('[OAuth] CLIENT_ID exists:', !!GITHUB_CLIENT_ID);
		console.log('[OAuth] CLIENT_SECRET exists:', !!GITHUB_CLIENT_SECRET);

		// Exchange code for access token
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
		console.log('[OAuth] Token response:', tokenData);

		if (tokenData.error) {
			console.error('[OAuth] Token error:', tokenData);
			throw error(400, tokenData.error_description || 'Failed to get access token');
		}

		// Store access token in HTTP-only cookie
		cookies.set('github_token', tokenData.access_token, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});
	} catch (err) {
		console.error('OAuth callback error:', err);
		throw error(500, 'Authentication failed');
	}

	// Redirect to the original destination (outside try/catch so redirect isn't caught)
	throw redirect(302, state);
};
