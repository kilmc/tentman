// SERVER_JUSTIFICATION: session
import { json } from '@sveltejs/kit';
import { normalizeSessionBootstrap } from '$lib/auth/session';
import { isGitHubOAuthConfigured } from '$lib/server/auth/github';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	logDevRouting('api:session', {
		isAuthenticated: locals.isAuthenticated,
		selectedBackend: locals.selectedBackend?.kind ?? null,
		selectedRepo: locals.selectedRepo?.full_name ?? null
	});

	return json(
		normalizeSessionBootstrap({
			isAuthenticated: locals.isAuthenticated,
			githubOAuthConfigured: isGitHubOAuthConfigured(),
			user: locals.user ?? null,
			selectedRepo: locals.selectedRepo ?? null,
			selectedBackend: locals.selectedBackend ?? null,
			rootConfig: locals.rootConfig ?? null,
			recentRepos: locals.recentRepos ?? []
		})
	);
};
