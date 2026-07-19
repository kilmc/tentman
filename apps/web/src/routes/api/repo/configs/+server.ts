// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError, persistSelectedGitHubRepository } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoConfigs } from '$lib/server/repo-config-bootstrap';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import { timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	const searchParams = url?.searchParams ?? new URLSearchParams();
	if (!locals.isAuthenticated || !locals.githubToken) {
		logDevRouting('api:repo-configs:unauthorized', {
			isAuthenticated: locals.isAuthenticated,
			hasGitHubToken: Boolean(locals.githubToken),
			selectedRepo: locals.selectedRepo?.full_name ?? null
		});
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		logDevRouting('api:repo-configs:missing-repo', {
			isAuthenticated: locals.isAuthenticated
		});
		throw error(400, 'No repository selected');
	}

	logDevRouting('api:repo-configs:start', {
		selectedRepo: locals.selectedRepo.full_name
	});

	try {
		const configs = await timeAsync(
			'api.repo.configs',
			{
				repo: locals.selectedRepo.full_name
			},
			() =>
				loadSelectedGitHubRepoConfigs(locals, cookies, {
					previousRef: searchParams.get('previousRef'),
					previousHeadSha: searchParams.get('previousHeadSha'),
					previousTreeSha: searchParams.get('previousTreeSha')
				})
		);
		persistSelectedGitHubRepository(
			cookies,
			locals.selectedRepo,
			configs.rootConfig,
			configs.repositoryIdentity
		);
		return json(configs);
	} catch (err) {
		logDevRouting('api:repo-configs:error', {
			selectedRepo: locals.selectedRepo.full_name,
			status: err && typeof err === 'object' && 'status' in err ? err.status : null,
			message: err instanceof Error ? err.message : 'Unknown error'
		});
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to load repo configs:', err);
		throw error(500, 'Failed to load repo configs');
	}
};
