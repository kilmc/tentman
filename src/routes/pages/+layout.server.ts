import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { isLocalMode, requireGitHubRepository } from '$lib/server/page-context';

/**
 * Server layout load with caching
 * Loads configs once, content is cached on-demand via hover prefetch
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const startTime = performance.now();
	console.log('🔵 [LAYOUT] Starting load...');

	if (isLocalMode(locals) && locals.selectedBackend?.kind === 'local') {
		return {
			configs: [],
			repo: locals.selectedBackend.repo,
			selectedBackend: locals.selectedBackend
		};
	}

	const { backend, repo } = requireGitHubRepository(locals);

	try {
		// Fetch configs with caching (uses module-level cache)
		const configs = await getCachedConfigs(backend);

		const totalTime = performance.now() - startTime;
		console.log(`✅ [LAYOUT] Total load time: ${totalTime.toFixed(0)}ms`);

		return {
			configs,
			repo,
			selectedBackend: locals.selectedBackend
		};
	} catch (err) {
		console.error('Failed to load configs:', err);
		throw redirect(302, '/repos?error=failed-to-load-configs');
	}
};
