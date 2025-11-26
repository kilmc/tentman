import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { discoverConfigs } from '$lib/config/discovery';

export const load: PageServerLoad = async ({ locals, params }) => {
	// Require authentication and selected repo
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const { owner, name } = locals.selectedRepo;

	try {
		// Discover all configs to find the matching one
		const configs = await discoverConfigs(locals.octokit, owner, name);

		// Find config matching the slug
		const config = configs.find((c) => c.slug === params.page);

		if (!config) {
			throw error(404, 'Configuration not found');
		}

		return {
			discoveredConfig: config,
			repo: locals.selectedRepo
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}
		console.error('Failed to load config:', err);
		throw error(500, 'Failed to load configuration');
	}
};
