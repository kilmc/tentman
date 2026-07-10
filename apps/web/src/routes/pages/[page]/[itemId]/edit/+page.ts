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
	const discoveredConfig = parentData.configs?.find((config) => config.slug === params.page) ?? null;
	if (cachedDocument && discoveredConfig) {
		const blockSupport = await githubRepositoryCache.getBlockSupport();
		return {
			discoveredConfig,
			blockConfigs: blockSupport?.blockConfigs ?? parentData.blockConfigs ?? [],
			packageBlocks: blockSupport?.packageBlocks ?? [],
			blockRegistryError: blockSupport?.blockRegistryError ?? null,
			navigationManifest: parentData.navigationManifest,
			item: cachedDocument.content,
			existingItems: await loadTagSuggestionItems(fetch, discoveredConfig, params.page),
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
		return {
			discoveredConfig,
			blockConfigs: warmedBlockSupport.blockConfigs,
			packageBlocks: warmedBlockSupport.packageBlocks,
			blockRegistryError: warmedBlockSupport.blockRegistryError,
			navigationManifest: parentData.navigationManifest,
			item: warmedDocument.content,
			existingItems: await loadTagSuggestionItems(fetch, discoveredConfig, params.page),
			contentError: null,
			itemId: params.itemId,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

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

	return {
		...data,
		existingItems: await loadTagSuggestionItems(fetch, data.discoveredConfig ?? null, params.page)
	};
};
