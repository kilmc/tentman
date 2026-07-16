// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoFreshness } from '$lib/server/repo-config-bootstrap';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import { timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	const searchParams = url?.searchParams ?? new URLSearchParams();
	if (!locals.isAuthenticated || !locals.githubToken) {
		logDevRouting('api:repo-freshness:unauthorized', {
			isAuthenticated: locals.isAuthenticated,
			hasGitHubToken: Boolean(locals.githubToken),
			selectedRepo: locals.selectedRepo?.full_name ?? null
		});
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		logDevRouting('api:repo-freshness:missing-repo', {
			isAuthenticated: locals.isAuthenticated
		});
		throw error(400, 'No repository selected');
	}

	logDevRouting('api:repo-freshness:start', {
		selectedRepo: locals.selectedRepo.full_name
	});

	try {
		const freshness = await timeAsync(
			'api.repo.freshness',
			{
				repo: locals.selectedRepo.full_name
			},
			() =>
				loadSelectedGitHubRepoFreshness(locals, cookies, {
					previousRef: searchParams.get('previousRef'),
					previousHeadSha: searchParams.get('previousHeadSha'),
					previousTreeSha: searchParams.get('previousTreeSha')
				})
		);
		return json(freshness);
	} catch (err) {
		logDevRouting('api:repo-freshness:error', {
			selectedRepo: locals.selectedRepo.full_name,
			status: err && typeof err === 'object' && 'status' in err ? err.status : null,
			message: err instanceof Error ? err.message : 'Unknown error'
		});
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to check repo freshness:', err);
		throw error(500, 'Failed to check repo freshness');
	}
};
