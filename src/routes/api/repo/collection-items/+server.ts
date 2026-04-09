// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { getOrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { getCachedContent } from '$lib/stores/content-cache';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing collection slug');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	const backend = createGitHubRepositoryBackend(octokit, locals.selectedRepo);

	try {
		const [configs, navigationManifest] = await Promise.all([
			getCachedConfigs(backend),
			loadNavigationManifestState(backend)
		]);
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
			getOrderedCollectionNavigation(discoveredConfig.config, content, navigationManifest.manifest)
		);
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`Failed to load collection items for ${slug}:`, err);
		throw error(500, 'Failed to load collection items');
	}
};
