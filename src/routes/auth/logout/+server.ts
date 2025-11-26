import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	// Clear the GitHub token cookie
	cookies.delete('github_token', { path: '/' });

	// Clear the selected repository cookie
	cookies.delete('selected_repo', { path: '/' });

	// Redirect to home page
	throw redirect(302, '/');
};
