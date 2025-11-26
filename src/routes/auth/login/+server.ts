import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_CLIENT_ID } from '$env/static/private';

export const GET: RequestHandler = async ({ url }) => {
	// Store the redirect URL if provided
	const redirectTo = url.searchParams.get('redirect') || '/';

	// GitHub OAuth authorization URL
	const authUrl = new URL('https://github.com/login/oauth/authorize');
	authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
	authUrl.searchParams.set('scope', 'repo'); // Request repo access for reading/writing content
	authUrl.searchParams.set('state', redirectTo); // Pass through redirect URL

	throw redirect(302, authUrl.toString());
};
