// SERVER_JUSTIFICATION: session
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearGitHubSession } from '$lib/server/auth/github';

export const GET: RequestHandler = async ({ cookies }) => {
	clearGitHubSession(cookies);

	// Redirect to home page
	throw redirect(302, '/');
};
