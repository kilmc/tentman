import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import {
	createEmptyPagesOverviewSummary,
	loadPagesOverviewSummary,
	type PagesOverviewSummary
} from '$lib/features/content-management/overview-summary';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	type RepoBootstrapIdentity
} from '$lib/repository/config-bootstrap';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { buildPathWithQuery, buildReposReturnHref } from '$lib/utils/routing';
import { markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';
import type { PageLoad } from './$types';

type PagesOverviewWarmReturnParentData = {
	selectedRepo?: {
		full_name: string;
	} | null;
	repositoryIdentity?: RepoBootstrapIdentity | null;
	activeDraftBranch?: string | null;
};

type PagesOverviewWarmReturnCacheEntry = {
	key: string;
	summary: PagesOverviewSummary;
};

let pagesOverviewWarmReturnCache: PagesOverviewWarmReturnCacheEntry | null = null;

function getPagesOverviewWarmReturnKey(
	parentData: PagesOverviewWarmReturnParentData
): string | null {
	const repoFullName = parentData.selectedRepo?.full_name;
	const identity = parentData.repositoryIdentity;

	if (!repoFullName || !identity) {
		return null;
	}

	return [
		repoFullName,
		parentData.activeDraftBranch ?? '',
		identity.repoKey,
		identity.ref,
		identity.headSha,
		identity.treeSha
	].join(':');
}

function getCachedPagesOverviewSummary(
	parentData: PagesOverviewWarmReturnParentData
): PagesOverviewSummary | null {
	const key = getPagesOverviewWarmReturnKey(parentData);

	if (!key || pagesOverviewWarmReturnCache?.key !== key) {
		return null;
	}

	return pagesOverviewWarmReturnCache.summary;
}

function cachePagesOverviewSummary(input: {
	parentData: PagesOverviewWarmReturnParentData;
	summary: PagesOverviewSummary;
}): void {
	const key = getPagesOverviewWarmReturnKey(input.parentData);

	if (!key) {
		return;
	}

	pagesOverviewWarmReturnCache = {
		key,
		summary: input.summary
	};
}

export function clearPagesOverviewWarmReturnCacheForTests(): void {
	pagesOverviewWarmReturnCache = null;
}

export const load: PageLoad = async ({ parent, fetch }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState({
		isAuthenticated: parentData.isAuthenticated,
		selectedBackend: parentData.selectedBackend ?? null,
		selectedRepo: parentData.selectedRepo ?? null,
		selectedRepoConfigSummary: parentData.selectedRepoConfigSummary ?? null
	});
	const configs = parentData.configs ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.configs;
	const navigationManifest =
		parentData.navigationManifest ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest;
	const canAddPage = (parentData.instructionDiscovery?.instructions.length ?? 0) > 0;

	if (workspace.mode === 'local') {
		pagesOverviewWarmReturnCache = null;
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
		const cachedSummary = getCachedPagesOverviewSummary(parentData);
		if (cachedSummary) {
			markWorkflowReadiness({
				workflow: 'return-to-pages',
				mark: 'overview-ready',
				route: '/pages'
			});
			return {
				summary: cachedSummary,
				canAddPage
			};
		}

		const summary = await loadPagesOverviewSummary(fetch, {
			configs,
			navigationManifest
		});
		cachePagesOverviewSummary({
			parentData,
			summary
		});
		return {
			summary,
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
