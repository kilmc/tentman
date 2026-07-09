import { redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
import { isCollectionGroupManagementEnabled } from '$lib/features/content-management/config';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, params, fetch }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState(parentData);

	if (workspace.mode === 'local') {
		return {
			discoveredConfig: null,
			pageSlug: params.page,
			collectionNavigation: null
		};
	}

	const discoveredConfig = parentData.configs.find((config) => config.slug === params.page);

	if (!discoveredConfig || !isCollectionGroupManagementEnabled(discoveredConfig.config)) {
		throw redirect(302, `/pages/${params.page}`);
	}

	if (workspace.mode === 'github' && workspace.isAuthenticated) {
		await githubRepositoryCache.hydrateFromBootstrap({
			repoFullName: workspace.selectedRepo.full_name,
			bootstrap: parentData
		});
		await githubRepositoryCache.ensureCollectionIndex(params.page, { fetcher: fetch });
	}

	return {
		discoveredConfig,
		pageSlug: params.page,
		collectionNavigation:
			workspace.mode === 'github'
				? await githubRepositoryCache.getCollectionNavigation(params.page)
				: null
	};
};
