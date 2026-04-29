import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import {
	createEmptyPagesOverviewSummary,
	loadPagesOverviewSummary
} from '$lib/features/content-management/overview-summary';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { buildPathWithQuery, buildReposReturnHref } from '$lib/utils/routing';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState({
		isAuthenticated: parentData.isAuthenticated,
		selectedBackend: parentData.selectedBackend ?? null,
		selectedRepo: parentData.selectedRepo ?? null,
		rootConfig: parentData.rootConfig ?? null
	});
	const configs = parentData.configs ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.configs;
	const navigationManifest =
		parentData.navigationManifest ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest;
	const canAddPage = (parentData.instructionDiscovery?.instructions.length ?? 0) > 0;

	if (workspace.mode === 'local') {
		return {
			summary: createEmptyPagesOverviewSummary(configs.length > 0),
			canAddPage: false
		};
	}

	if (!workspace.isAuthenticated) {
		throw redirect(
			302,
			dev
				? buildPathWithQuery('/repos', {
						returnTo: '/pages',
						debugFailure: 'pages-overview-unauthenticated'
					})
				: buildReposReturnHref('/repos', '/pages')
		);
	}

	if (workspace.mode !== 'github') {
		throw redirect(
			302,
			dev
				? buildPathWithQuery('/repos', {
						returnTo: '/pages',
						debugFailure: 'pages-overview-missing-repo'
					})
				: '/repos'
		);
	}

	const orderedConfigs = orderDiscoveredConfigs(
		configs,
		navigationManifest.manifest,
		parentData.rootConfig ?? null
	);

	if (orderedConfigs.length === 0) {
		return {
			summary: createEmptyPagesOverviewSummary(false),
			canAddPage
		};
	}

	try {
		return {
			summary: await loadPagesOverviewSummary(fetch, {
				configs,
				navigationManifest
			}),
			canAddPage
		};
	} catch (error) {
		console.error('Failed to load pages overview summary:', error);

		return {
			summary: createEmptyPagesOverviewSummary(true),
			canAddPage
		};
	}
};
