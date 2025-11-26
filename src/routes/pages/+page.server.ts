import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { discoverConfigs } from '$lib/config/discovery';

export const load: PageServerLoad = async ({ locals }) => {
	// Require authentication and selected repo
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const { owner, name } = locals.selectedRepo;

	try {
		// Discover all config files in the repository
		const configs = await discoverConfigs(locals.octokit, owner, name);

		return {
			configs,
			repo: locals.selectedRepo
		};
	} catch (err) {
		console.error('Failed to discover configs:', err);
		throw error(500, 'Failed to load configuration files from repository');
	}
};
