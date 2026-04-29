import { error, redirect, type Cookies } from '@sveltejs/kit';
import type { DiscoveredConfig } from '$lib/config/discovery';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import type { GitHubUserSnapshot } from '$lib/auth/session';
import { buildReposReturnHref } from '$lib/utils/routing';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';

type AppLocals = App.Locals;
type GitHubRequestContext = {
	locals: AppLocals;
	cookies: Pick<Cookies, 'delete'>;
};

interface GitHubRepositoryContext {
	backend: ReturnType<typeof createGitHubRepositoryBackend>;
	octokit: ReturnType<typeof createGitHubServerClient>;
	repo: NonNullable<AppLocals['selectedRepo']>;
	owner: string;
	name: string;
	user?: GitHubUserSnapshot;
}

export function isLocalMode(locals: AppLocals): boolean {
	return locals.selectedBackend?.kind === 'local';
}

export function requireGitHubRepository(
	{ locals, cookies }: GitHubRequestContext,
	redirectTo = '/pages'
): GitHubRepositoryContext {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw redirect(302, buildReposReturnHref('/repos', redirectTo));
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	const backend = createGitHubRepositoryBackend(octokit, locals.selectedRepo);

	return {
		backend,
		octokit,
		repo: locals.selectedRepo,
		owner: locals.selectedRepo.owner,
		name: locals.selectedRepo.name,
		user: locals.user
	};
}

export async function requireDiscoveredConfig(
	context: GitHubRequestContext,
	pageSlug: string,
	redirectTo = '/pages'
): Promise<{
	backend: ReturnType<typeof createGitHubRepositoryBackend>;
	octokit: GitHubRepositoryContext['octokit'];
	repo: NonNullable<AppLocals['selectedRepo']>;
	owner: string;
	name: string;
	discoveredConfig: DiscoveredConfig;
}> {
	const repository = requireGitHubRepository(context, redirectTo);
	const configs = await getCachedConfigs(repository.backend);
	const discoveredConfig = configs.find((config) => config.slug === pageSlug);

	if (!discoveredConfig) {
		throw error(404, 'Configuration not found');
	}

	return {
		...repository,
		discoveredConfig
	};
}

export async function getOptionalDraftBranchName(
	context: GitHubRequestContext,
	redirectTo = '/pages'
): Promise<string | undefined> {
	const repository = requireGitHubRepository(context, redirectTo);
	return getLatestPreviewBranchName(repository.octokit, repository.owner, repository.name);
}

export function handleGitHubRouteError(
	context: GitHubRequestContext,
	value: unknown,
	redirectTo?: string
): void {
	handleGitHubSessionError(context, value, redirectTo ? { redirectTo } : undefined);
}
