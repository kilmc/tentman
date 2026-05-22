// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { resolveContentDocumentState } from '$lib/features/content-management/state';
import { getCachedContent } from '$lib/stores/content-cache';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const requestContext = { locals, cookies };

	try {
		const { backend, configs, rootConfig } = await loadSelectedGitHubRepoBootstrapContext(
			locals,
			cookies
		);
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
		handleGitHubSessionError(requestContext, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to load config states:', err);
		throw error(500, 'Failed to load config states');
	}
};
