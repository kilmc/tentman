import { error, redirect } from '@sveltejs/kit';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import type { DiscoveredConfig } from '$lib/types/config';

type AppLocals = App.Locals;

export function requireAuthenticatedRepo(locals: AppLocals, redirectTo = '/pages') {
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, `/auth/login?redirect=${redirectTo}`);
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	return {
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
	octokit: NonNullable<AppLocals['octokit']>;
	repo: NonNullable<AppLocals['selectedRepo']>;
	owner: string;
	name: string;
	discoveredConfig: DiscoveredConfig;
}> {
	const context = requireAuthenticatedRepo(locals, redirectTo);
	const configs = await getCachedConfigs(context.octokit, context.owner, context.name);
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
	const context = requireAuthenticatedRepo(locals);
	return getLatestPreviewBranchName(context.octokit, context.owner, context.name);
}
