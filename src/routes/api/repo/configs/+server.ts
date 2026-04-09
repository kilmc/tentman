// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import { normalizeRepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	const backend = createGitHubRepositoryBackend(octokit, locals.selectedRepo);

	try {
		const [configs, blockConfigs, rootConfig, navigationManifest] = await Promise.all([
			getCachedConfigs(backend),
			backend.discoverBlockConfigs(),
			backend.readRootConfig(),
			loadNavigationManifestState(backend)
		]);

		return json(
			normalizeRepoConfigsBootstrap({
				configs,
				blockConfigs,
				rootConfig,
				navigationManifest
			})
		);
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to load repo configs:', err);
		throw error(500, 'Failed to load repo configs');
	}
};
