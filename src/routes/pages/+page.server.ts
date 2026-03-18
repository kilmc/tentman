import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isLocalMode } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals }) => {
	if (isLocalMode(locals)) {
		return {};
	}

	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	return {};
};
