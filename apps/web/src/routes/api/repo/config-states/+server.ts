// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { resolveContentDocumentState } from '$lib/features/content-management/state';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { getCachedContent } from '$lib/stores/content-cache';
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
		const [configs, rootConfig] = await Promise.all([getCachedConfigs(backend), backend.readRootConfig()]);
		const statesBySlugEntries = await Promise.all(
			configs
				.filter((config) => !!config.config.state)
				.map(async (config) => {
					const content = await getCachedContent(
						backend,
						config.config,
						config.path,
						config.slug
					);
					const state = resolveContentDocumentState(config.config, content, rootConfig);

					return [config.slug, state] as const;
				})
		);
		const statesBySlug = Object.fromEntries(
			statesBySlugEntries.flatMap(([slug, state]) => (state ? ([[slug, state]] as const) : []))
		);

		return json({
			statesBySlug
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to load config states:', err);
		throw error(500, 'Failed to load config states');
	}
};
