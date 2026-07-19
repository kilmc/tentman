import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import type { BlockUsage } from '$lib/config/types';
import {
	hasTagsBlock,
	loadCollectionExistingItems
} from '$lib/features/content-management/collection-existing-items';
import { normalizeGitHubPageViewRouteData } from '$lib/repository/github-workflow-route-capabilities';

async function loadTagSuggestionItems(
	fetcher: typeof fetch,
	discoveredConfig: { config?: { blocks?: BlockUsage[] } } | null,
	slug: string
) {
	return discoveredConfig && hasTagsBlock(discoveredConfig.config?.blocks)
		? await loadCollectionExistingItems(fetcher, slug)
		: [];
}

export const load: PageLoad = async ({ parent, fetch, params, depends, url }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState(parentData);
	const reposRedirect = buildReposRedirect('/repos', url);

	if (workspace.mode === 'local') {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null,
			editor: null,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	if (workspace.mode !== 'github' || !workspace.isAuthenticated) {
		throw redirect(302, reposRedirect);
	}

	depends('app:content');

	const response = await fetch(
		buildPathWithQuery('/api/repo/form-config', {
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
		throw httpError(response.status, 'Failed to load form config');
	}

	const data = normalizeGitHubPageViewRouteData({
		repoFullName: workspace.selectedRepo.full_name,
		bootstrap: parentData,
		slug: params.page,
		data: await response.json()
	});

	if (!data?.discoveredConfig?.config?.collection) {
		throw redirect(302, `/pages/${params.page}`);
	}

	return {
		...data,
		editor: data.editor,
		existingItems: await loadTagSuggestionItems(fetch, data.discoveredConfig ?? null, params.page)
	};
};
