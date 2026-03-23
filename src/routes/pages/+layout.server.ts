import { redirect } from '@sveltejs/kit';
import { getCollectionNavigationItems } from '$lib/features/content-management/navigation';
import { getCachedContent } from '$lib/stores/content-cache';
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
			collectionItemsBySlug: {},
			repo: locals.selectedBackend.repo,
			selectedBackend: locals.selectedBackend
		};
	}

	const { backend, repo } = requireGitHubRepository(locals);

	try {
		// Fetch configs with caching (uses module-level cache)
		const configs = await getCachedConfigs(backend);
		const collectionItemsBySlug = Object.fromEntries(
			await Promise.all(
				configs
					.filter((config) => config.config.collection)
					.map(async (config) => {
						try {
							const content = await getCachedContent(
								backend,
								config.config,
								config.path,
								config.slug
							);

							return [config.slug, getCollectionNavigationItems(config.config, content)] as const;
						} catch (error) {
							console.error(`Failed to load sidebar items for ${config.slug}:`, error);
							return [config.slug, []] as const;
						}
					})
			)
		);

		const totalTime = performance.now() - startTime;
		console.log(`✅ [LAYOUT] Total load time: ${totalTime.toFixed(0)}ms`);

		return {
			configs,
			collectionItemsBySlug,
			repo,
			selectedBackend: locals.selectedBackend
		};
	} catch (err) {
		console.error('Failed to load configs:', err);
		throw redirect(302, '/repos?error=failed-to-load-configs');
	}
};
