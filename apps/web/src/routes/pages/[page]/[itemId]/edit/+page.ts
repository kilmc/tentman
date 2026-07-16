import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
import type { BlockUsage } from '$lib/config/types';
import {
	hasTagsBlock,
	loadCollectionExistingItems
} from '$lib/features/content-management/collection-existing-items';
import { markWorkflowReadiness, traceBrowserRequest } from '$lib/utils/workflow-instrumentation';

async function loadTagSuggestionItems(
	fetcher: typeof fetch,
	discoveredConfig: { config?: { blocks?: BlockUsage[] } } | null,
	slug: string
) {
	return discoveredConfig && hasTagsBlock(discoveredConfig.config?.blocks)
		? await loadCollectionExistingItems(fetcher, slug)
		: [];
}

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

	const cachedDocument = await githubRepositoryCache.getItemDocumentForRoute({
		slug: params.page,
		itemId: params.itemId
	});
	const discoveredConfig =
		parentData.configs?.find((config) => config.slug === params.page) ?? null;
	if (cachedDocument && discoveredConfig) {
		const blockSupport = await githubRepositoryCache.getBlockSupport();
		const existingItems = await loadTagSuggestionItems(fetch, discoveredConfig, params.page);
		markWorkflowReadiness({
			workflow: 'item-route-shell',
			mark: 'edit-ready',
			route: `/pages/${params.page}/${params.itemId}/edit`,
			slug: params.page,
			itemId: params.itemId
		});
		return {
			discoveredConfig,
			blockConfigs: blockSupport?.blockConfigs ?? parentData.blockConfigs ?? [],
			packageBlocks: blockSupport?.packageBlocks ?? [],
			blockRegistryError: blockSupport?.blockRegistryError ?? null,
			navigationManifest: parentData.navigationManifest,
			item: cachedDocument.content,
			existingItems,
			contentError: null,
			itemId: params.itemId,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

	const warmedDocument = await githubRepositoryCache.warmItemDocumentForRoute({
		slug: params.page,
		itemId: params.itemId,
		fetcher: fetch,
		priority: 'foreground'
	});
	const warmedBlockSupport = await githubRepositoryCache.getBlockSupport();
	if (warmedDocument && discoveredConfig && warmedBlockSupport) {
		const existingItems = await loadTagSuggestionItems(fetch, discoveredConfig, params.page);
		markWorkflowReadiness({
			workflow: 'item-route-shell',
			mark: 'edit-ready',
			route: `/pages/${params.page}/${params.itemId}/edit`,
			slug: params.page,
			itemId: params.itemId
		});
		return {
			discoveredConfig,
			blockConfigs: warmedBlockSupport.blockConfigs,
			packageBlocks: warmedBlockSupport.packageBlocks,
			blockRegistryError: warmedBlockSupport.blockRegistryError,
			navigationManifest: parentData.navigationManifest,
			item: warmedDocument.content,
			existingItems,
			contentError: null,
			itemId: params.itemId,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

	const itemViewEndpoint = buildPathWithQuery('/api/repo/item-view', {
		slug: params.page,
		itemId: params.itemId
	});
	const response = await traceBrowserRequest(
		{
			workflow: 'item-route-shell',
			route: `/pages/${params.page}/${params.itemId}/edit`,
			endpoint: itemViewEndpoint,
			priority: 'foreground',
			cacheTaskKey: null,
			duplicateState: 'unique'
		},
		() => fetch(itemViewEndpoint)
	);

	if (response.status === 401) {
		throw redirect(302, reposRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Item not found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load item edit view');
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
	const existingItems = await loadTagSuggestionItems(
		fetch,
		data.discoveredConfig ?? null,
		params.page
	);
	markWorkflowReadiness({
		workflow: 'item-route-shell',
		mark: 'edit-ready',
		route: `/pages/${params.page}/${params.itemId}/edit`,
		slug: params.page,
		itemId: params.itemId
	});

	return {
		...data,
		existingItems
	};
};
