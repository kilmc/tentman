import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Require authentication and selected repo
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	// Configs are already loaded by parent layout with caching
	// No need to fetch again - they'll be available via automatic data flow
	return {
		// Parent layout provides: configs, repo
	};
};
