// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { resolveContentDocumentState } from '$lib/features/content-management/state';
import { getCachedContent } from '$lib/stores/content-cache';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const requestContext = { locals, cookies };

	try {
		return await timeAsync(
			'api.repo.config-states',
			{
				repo: locals.selectedRepo?.full_name ?? null
			},
			async () => {
				const { backend, configs, rootConfig } = await loadSelectedGitHubRepoBootstrapContext(
					locals,
					cookies
				);
				const stateConfigs = configs.filter((config) => !!config.config.state);
				const statesBySlugEntries = await Promise.all(
					stateConfigs.map(async (config) => {
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

				logTiming('api.repo.config-states.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					stateConfigCount: stateConfigs.length,
					resolvedStateCount: Object.keys(statesBySlug).length
				});

				return json({
					statesBySlug
				});
			}
		);
	} catch (err) {
		handleGitHubSessionError(requestContext, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to load config states:', err);
		throw error(500, 'Failed to load config states');
	}
};
