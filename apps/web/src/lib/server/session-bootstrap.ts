import { normalizeSessionBootstrap, type SessionBootstrap } from '$lib/auth/session';
import { isGitHubOAuthConfigured } from '$lib/server/auth/github';

export function buildSessionBootstrap(locals: App.Locals): SessionBootstrap {
	return normalizeSessionBootstrap({
		isAuthenticated: locals.isAuthenticated,
		githubOAuthConfigured: isGitHubOAuthConfigured(),
		user: locals.user ?? null,
		selectedRepo: locals.selectedRepo ?? null,
		selectedBackend: locals.selectedBackend ?? null,
		selectedRepoConfigSummary: locals.selectedRepoConfigSummary ?? null,
		recentRepos: locals.recentRepos ?? []
	});
}
