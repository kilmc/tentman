// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createGitHubServerClient,
	handleGitHubSessionError
} from '$lib/server/auth/github';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Unauthorized');
	}

	try {
		const octokit = createGitHubServerClient(locals.githubToken, cookies);
		const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
			sort: 'updated',
			per_page: 100
		});

		return json({
			repos: repos.map((repo) => ({
				id: repo.id,
				name: repo.name,
				full_name: repo.full_name,
				owner: repo.owner.login,
				description: repo.description,
				private: repo.private,
				updated_at: repo.updated_at
			}))
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);
		console.error('Failed to fetch repositories:', err);
		throw error(500, 'Failed to load repositories');
	}
};
