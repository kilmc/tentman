import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';

export const load: PageLoad = async ({ parent, fetch, params, url, depends }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState(parentData);
	const reposRedirect = buildReposRedirect('/repos', url);

	if (workspace.mode === 'local') {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			content: null,
			contentError: null,
			blockRegistryError: null,
			draftBranch: null,
			draftChanges: null,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	if (workspace.mode !== 'github' || !workspace.isAuthenticated) {
		throw redirect(302, reposRedirect);
	}

	depends('app:content');

	const discoveredConfig = parentData.configs.find((config) => config.slug === params.page);
	if (discoveredConfig?.config.collection && url.searchParams.size === 0) {
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: workspace.selectedRepo.full_name,
			bootstrap: parentData
		});
		await githubRepositoryCache.ensureCollectionIndex(params.page, { fetcher: fetch });

		return {
			discoveredConfig,
			blockConfigs: parentData.blockConfigs ?? [],
			packageBlocks: [],
			blockRegistryError: null,
			content: null,
			collectionNavigation: await githubRepositoryCache.getCollectionNavigation(params.page),
			contentError: null,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

	const response = await fetch(
		buildPathWithQuery('/api/repo/page-view', {
			slug: params.page
		})
	);

	if (response.status === 401) {
		throw redirect(302, reposRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Configuration not found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load page view');
	}

	return await response.json();
};
