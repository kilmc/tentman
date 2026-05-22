// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { getOrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import { getCachedContent } from '$lib/stores/content-cache';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing collection slug');
	}

	const requestContext = { locals, cookies };

	try {
		const { backend, configs, navigationManifest, rootConfig } =
			await loadSelectedGitHubRepoBootstrapContext(locals, cookies);
		const discoveredConfig = configs.find((config) => config.slug === slug);

		if (!discoveredConfig) {
			throw error(404, 'Configuration not found');
		}

		if (!discoveredConfig.config.collection) {
			return json({ items: [] });
		}

		const content = await getCachedContent(
			backend,
			discoveredConfig.config,
			discoveredConfig.path,
			discoveredConfig.slug
		);

		return json(
			getOrderedCollectionNavigation(
				discoveredConfig.config,
				content,
				navigationManifest.manifest,
				rootConfig
			)
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
