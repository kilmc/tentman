import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch, params, url, depends }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState(parentData);
	const reposRedirect = buildReposRedirect('/repos', url);

	if (workspace.mode === 'local') {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			item: null,
			contentError: null,
			blockRegistryError: null,
			branch: null,
			itemId: params.itemId,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	if (workspace.mode !== 'github' || !workspace.isAuthenticated) {
		throw redirect(302, reposRedirect);
	}

	depends('app:content');

	await githubRepositoryCache.hydrateFromBootstrap({
		repoFullName: workspace.selectedRepo.full_name,
		bootstrap: parentData
	});

	const response = await fetch(
		buildPathWithQuery('/api/repo/item-view', {
			slug: params.page,
			itemId: params.itemId
		})
	);

	if (response.status === 401) {
		throw redirect(302, reposRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Item not found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load item view');
	}

	const data = await response.json();

	if (
		data &&
		typeof data === 'object' &&
		'redirectTo' in data &&
		typeof data.redirectTo === 'string'
	) {
		throw redirect(302, data.redirectTo);
	}

	await githubRepositoryCache.setItemDocumentForRoute({
		slug: params.page,
		itemId: params.itemId,
		content: data.item ?? null
	});

	return data;
};
