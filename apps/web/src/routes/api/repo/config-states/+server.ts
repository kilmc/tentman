// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoConfigStates } from '$lib/server/repo-config-bootstrap';
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
				const { statesBySlug, source, stateConfigCount, workflowData } =
					await loadSelectedGitHubRepoConfigStates(locals, cookies);

				logTiming('api.repo.config-states.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					stateConfigCount,
					resolvedStateCount: Object.keys(statesBySlug).length,
					source
				});

				return json({
					statesBySlug,
					workflowData
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
