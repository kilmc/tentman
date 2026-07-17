import { browser } from '$app/environment';
import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import { githubWorkflowRouteCapabilities } from '$lib/repository/github-workflow-route-capabilities';
import { markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';
import { hasTagsBlock } from '$lib/features/content-management/collection-existing-items';

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

	if (!browser) {
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

		const workflowData = data.workflowData ?? null;
		if (!workflowData) {
			return {
				...data,
				existingItems: data.existingItems ?? []
			};
		}

		return {
			...data,
			discoveredConfig: workflowData.discoveredConfig ?? data.discoveredConfig,
			blockConfigs: workflowData.blockSupport.blockConfigs,
			packageBlocks: workflowData.blockSupport.packageBlocks,
			blockRegistryError: workflowData.blockSupport.error,
			navigationManifest: workflowData.navigationManifest ?? data.navigationManifest,
			item: workflowData.item,
			existingItems: data.existingItems ?? [],
			contentError: workflowData.contentError,
			workflowData
		};
	}

	const discoveredConfig =
		parentData.configs?.find((config) => config.slug === params.page) ?? null;
	const workflowData = await githubWorkflowRouteCapabilities.loadItemViewWorkflowData({
		repoFullName: workspace.selectedRepo.full_name,
		bootstrap: parentData,
		slug: params.page,
		itemId: params.itemId,
		fetcher: fetch,
		priority: 'foreground',
		route: `/pages/${params.page}/${params.itemId}/edit`
	});
	const routeStatus = workflowData.cacheMiss?.status ?? null;
	if (routeStatus === 401) {
		throw redirect(302, reposRedirect);
	}
	if (routeStatus === 404) {
		throw httpError(404, 'Item not found');
	}
	if (
		workflowData.readiness === 'missing' &&
		discoveredConfig &&
		!discoveredConfig.config.collection
	) {
		throw redirect(302, `/pages/${params.page}/edit`);
	}
	if (workflowData.readiness === 'missing') {
		throw httpError(404, 'Item not found');
	}
	if (workflowData.readiness === 'error') {
		throw httpError(500, 'Failed to load item edit view');
	}
	const routeConfig = workflowData.discoveredConfig ?? discoveredConfig;
	const existingItems =
		routeConfig && hasTagsBlock(routeConfig.config?.blocks)
			? await githubWorkflowRouteCapabilities.loadExistingItemsForRoute({
					repoFullName: workspace.selectedRepo.full_name,
					bootstrap: parentData,
					slug: params.page,
					fetcher: fetch,
					priority: 'foreground'
				})
			: [];
	markWorkflowReadiness({
		workflow: 'item-route-shell',
		mark: 'edit-ready',
		route: `/pages/${params.page}/${params.itemId}/edit`,
		slug: params.page,
		itemId: params.itemId
	});

	return {
		discoveredConfig: routeConfig,
		blockConfigs: workflowData.blockSupport.blockConfigs,
		packageBlocks: workflowData.blockSupport.packageBlocks,
		blockRegistryError: workflowData.blockSupport.error,
		navigationManifest: workflowData.navigationManifest ?? parentData.navigationManifest,
		item: workflowData.item,
		existingItems,
		contentError: workflowData.contentError,
		workflowData,
		itemId: params.itemId,
		branch: parentData.activeDraftBranch,
		pageSlug: params.page,
		mode: 'github' as const
	};
};
