import type { LayoutServerLoad } from './$types';
import { createGitHubRepositoryBackend } from '$lib/repository/github';

export const load: LayoutServerLoad = async ({ locals }) => {
	const rootConfig =
		locals.selectedBackend?.kind === 'github' && locals.selectedRepo && locals.octokit
			? await createGitHubRepositoryBackend(locals.octokit, locals.selectedRepo).readRootConfig()
			: null;

	return {
		isAuthenticated: locals.isAuthenticated,
		user: locals.user,
		selectedRepo: locals.selectedRepo,
		selectedBackend: locals.selectedBackend,
		rootConfig
	};
};
