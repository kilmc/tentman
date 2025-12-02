import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getCachedConfigs } from '$lib/stores/config-cache';

/**
 * Server layout load with caching
 * Loads configs once, content is cached on-demand via hover prefetch
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const startTime = performance.now();
	console.log('🔵 [LAYOUT] Starting load...');

	// Require authentication and selected repo
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const { owner, name } = locals.selectedRepo;

	try {
		// Fetch configs with caching (uses module-level cache)
		const configs = await getCachedConfigs(locals.octokit, owner, name);

		const totalTime = performance.now() - startTime;
		console.log(`✅ [LAYOUT] Total load time: ${totalTime.toFixed(0)}ms`);

		return {
			configs,
			repo: locals.selectedRepo
		};
	} catch (err) {
		console.error('Failed to load configs:', err);
		throw redirect(302, '/repos?error=failed-to-load-configs');
	}
};
