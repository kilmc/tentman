import { browser } from '$app/environment';
import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import { githubWorkflowRouteCapabilities } from '$lib/repository/github-workflow-route-capabilities';
import { markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';

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
		const workflowData = await githubWorkflowRouteCapabilities.loadCollectionNavigationWorkflowData(
			{
				repoFullName: workspace.selectedRepo.full_name,
				bootstrap: parentData,
				slug: params.page,
				fetcher: fetch
			}
		);

		return {
			discoveredConfig,
			blockConfigs: parentData.blockConfigs ?? [],
			packageBlocks: [],
			blockRegistryError: null,
			content: null,
			collectionNavigation: workflowData.navigation,
			contentError:
				workflowData.readiness === 'error' ? (workflowData.cacheMiss?.reason ?? null) : null,
			workflowData,
			branch: parentData.activeDraftBranch,
			pageSlug: params.page,
			mode: 'github' as const
		};
	}

	if (!browser) {
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

		const data = await response.json();
		const workflowData = data.workflowData ?? null;
		if (!workflowData) {
			return data;
		}

		return {
			...data,
			discoveredConfig: workflowData.discoveredConfig ?? data.discoveredConfig,
			blockConfigs: workflowData.blockSupport.blockConfigs,
			packageBlocks: workflowData.blockSupport.packageBlocks,
			blockRegistryError: workflowData.blockSupport.error,
			content: workflowData.content,
			collectionNavigation: workflowData.collectionNavigation,
			contentError: workflowData.contentError,
			workflowData
		};
	}

	const workflowData = await githubWorkflowRouteCapabilities.loadPageViewWorkflowData({
		repoFullName: workspace.selectedRepo.full_name,
		bootstrap: parentData,
		slug: params.page,
		fetcher: fetch,
		priority: 'foreground'
	});
	const routeStatus = workflowData.cacheMiss?.status ?? null;
	if (routeStatus === 401) {
		throw redirect(302, reposRedirect);
	}
	if (routeStatus === 404) {
		throw httpError(404, 'Configuration not found');
	}
	if (workflowData.readiness === 'error') {
		throw httpError(500, 'Failed to load page view');
	}
	markWorkflowReadiness({
		workflow: 'item-route-shell',
		mark: 'ready',
		route: `/pages/${params.page}`,
		slug: params.page
	});

	return {
		discoveredConfig: workflowData.discoveredConfig ?? discoveredConfig,
		blockConfigs: workflowData.blockSupport.blockConfigs,
		packageBlocks: workflowData.blockSupport.packageBlocks,
		blockRegistryError: workflowData.blockSupport.error,
		content: workflowData.content,
		collectionNavigation: workflowData.collectionNavigation,
		contentError: workflowData.contentError,
		workflowData,
		branch: parentData.activeDraftBranch,
		pageSlug: params.page,
		mode: 'github' as const
	};
};
