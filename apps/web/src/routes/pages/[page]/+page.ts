import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
import { markWorkflowReadiness, traceBrowserRequest } from '$lib/utils/workflow-instrumentation';

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
		const workflowData = await githubRepositoryCache.loadCollectionNavigationWorkflowData(params.page, {
			fetcher: fetch
		});

		return {
			discoveredConfig,
			blockConfigs: parentData.blockConfigs ?? [],
			packageBlocks: [],
			blockRegistryError: null,
			content: null,
			collectionNavigation: workflowData.navigation,
			contentError:
				workflowData.readiness === 'error' ? workflowData.cacheMiss?.reason ?? null : null,
			workflowData,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

	await githubRepositoryCache.hydrateFromBootstrap({
		repoFullName: workspace.selectedRepo.full_name,
		bootstrap: parentData
	});
	const cachedSingleton = await githubRepositoryCache.warmSingletonDocumentRoute({
		slug: params.page,
		fetcher: fetch,
		priority: 'foreground'
	});
	if (discoveredConfig && cachedSingleton?.blockSupport) {
		markWorkflowReadiness({
			workflow: 'item-route-shell',
			mark: 'ready',
			route: `/pages/${params.page}`,
			slug: params.page
		});
		return {
			discoveredConfig,
			blockConfigs: cachedSingleton.blockSupport.blockConfigs,
			packageBlocks: cachedSingleton.blockSupport.packageBlocks,
			blockRegistryError: cachedSingleton.blockSupport.blockRegistryError,
			content: cachedSingleton.content,
			collectionNavigation: null,
			contentError: null,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

	const pageViewEndpoint = buildPathWithQuery('/api/repo/page-view', {
		slug: params.page
	});
	const response = await traceBrowserRequest(
		{
			workflow: 'item-route-shell',
			route: `/pages/${params.page}`,
			endpoint: pageViewEndpoint,
			priority: 'foreground',
			cacheTaskKey: null,
			duplicateState: 'unique'
		},
		() => fetch(pageViewEndpoint)
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

	const data = await response.json();
	await githubRepositoryCache.setSingletonPageView({
		slug: params.page,
		content: data.content ?? null,
		blockConfigs: data.blockConfigs,
		packageBlocks: data.packageBlocks,
		blockRegistryError: data.blockRegistryError ?? null
	});
	markWorkflowReadiness({
		workflow: 'item-route-shell',
		mark: 'ready',
		route: `/pages/${params.page}`,
		slug: params.page
	});

	return data;
};
