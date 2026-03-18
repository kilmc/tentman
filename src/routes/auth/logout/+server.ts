import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SELECTED_BACKEND_COOKIE } from '$lib/repository/selection';

export const GET: RequestHandler = async ({ cookies }) => {
	// Clear the GitHub token cookie
	cookies.delete('github_token', { path: '/' });

	// Clear the selected repository cookie
	cookies.delete('selected_repo', { path: '/' });
	cookies.delete(SELECTED_BACKEND_COOKIE, { path: '/' });

	// Redirect to home page
	throw redirect(302, '/');
};
