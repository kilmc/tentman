// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import { resolveCollectionNavigationForRoute } from '$lib/server/repository-data/route-fallbacks';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing collection slug');
	}

	const requestContext = { locals, cookies };

	try {
		return await timeAsync(
			'api.repo.collection-items',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				slug
			},
			async () => {
				const { backend, configs, navigationManifest, rootConfig } =
					await loadSelectedGitHubRepoBootstrapContext(locals, cookies);
				const discoveredConfig = configs.find((config) => config.slug === slug);

				if (!discoveredConfig) {
					throw error(404, 'Configuration not found');
				}

				if (!discoveredConfig.config.collection) {
					return json({ items: [] });
				}

				const { navigation, source } = await resolveCollectionNavigationForRoute({
					backend,
					discoveredConfig,
					navigationManifest: navigationManifest.manifest,
					rootConfig
				});

				logTiming('api.repo.collection-items.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					slug,
					source,
					itemCount: navigation.items.length,
					groupCount: navigation.groups.length
				});

				return json(navigation);
			}
		);
	} catch (err) {
		handleGitHubSessionError(requestContext, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`Failed to load collection items for ${slug}:`, err);
		throw error(500, 'Failed to load collection items');
	}
};
