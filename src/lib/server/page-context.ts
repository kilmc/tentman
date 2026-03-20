import { error, redirect } from '@sveltejs/kit';
import type { DiscoveredConfig } from '$lib/config/discovery';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { createGitHubRepositoryBackend } from '$lib/repository/github';

type AppLocals = App.Locals;

export function isLocalMode(locals: AppLocals): boolean {
	return locals.selectedBackend?.kind === 'local';
}

export function requireGitHubRepository(locals: AppLocals, redirectTo = '/pages') {
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, `/auth/login?redirect=${redirectTo}`);
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const backend = createGitHubRepositoryBackend(locals.octokit, locals.selectedRepo);

	return {
		backend,
		octokit: locals.octokit,
		repo: locals.selectedRepo,
		owner: locals.selectedRepo.owner,
		name: locals.selectedRepo.name
	};
}

export async function requireDiscoveredConfig(
	locals: AppLocals,
	pageSlug: string,
	redirectTo = '/pages'
): Promise<{
	backend: ReturnType<typeof createGitHubRepositoryBackend>;
	octokit: NonNullable<AppLocals['octokit']>;
	repo: NonNullable<AppLocals['selectedRepo']>;
	owner: string;
	name: string;
	discoveredConfig: DiscoveredConfig;
}> {
	const context = requireGitHubRepository(locals, redirectTo);
	const configs = await getCachedConfigs(context.backend);
	const discoveredConfig = configs.find((config) => config.slug === pageSlug);

	if (!discoveredConfig) {
		throw error(404, 'Configuration not found');
	}

	return {
		...context,
		discoveredConfig
	};
}

export async function getOptionalDraftBranchName(locals: AppLocals): Promise<string | undefined> {
	const context = requireGitHubRepository(locals);
	return getLatestPreviewBranchName(context.octokit, context.owner, context.name);
}
