// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import { resolveSingletonConfigStatesForRoute } from '$lib/server/repository-data/route-data';
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
				const { statesBySlug, source, stateConfigCount } =
					await resolveSingletonConfigStatesForRoute({
						backend,
						configs,
						rootConfig
					});

				logTiming('api.repo.config-states.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					stateConfigCount,
					resolvedStateCount: Object.keys(statesBySlug).length,
					source
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
