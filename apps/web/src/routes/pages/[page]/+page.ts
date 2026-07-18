import { browser } from '$app/environment';
import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
import {
	githubWorkflowRouteCapabilities,
	normalizeGitHubPageViewRouteData
} from '$lib/repository/github-workflow-route-capabilities';
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
			editor: null,
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
		const collectionNavigationWorkflowData =
			await githubWorkflowRouteCapabilities.loadCollectionNavigationWorkflowData({
				repoFullName: workspace.selectedRepo.full_name,
				bootstrap: parentData,
				slug: params.page,
				fetcher: fetch
			});
		const contentError =
			collectionNavigationWorkflowData.readiness === 'error'
				? (collectionNavigationWorkflowData.cacheMiss?.reason ?? null)
				: null;
		const routeData = normalizeGitHubPageViewRouteData({
			repoFullName: workspace.selectedRepo.full_name,
			bootstrap: parentData,
			slug: params.page,
			data: {
				discoveredConfig,
				blockConfigs: parentData.blockConfigs ?? [],
				packageBlocks: [],
				blockRegistryError: null,
				content: null,
				collectionNavigation: collectionNavigationWorkflowData.navigation,
				contentError,
				pageSlug: params.page,
				mode: 'github'
			}
		});

		return {
			...routeData,
			collectionNavigation: collectionNavigationWorkflowData.navigation
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

		const data = normalizeGitHubPageViewRouteData({
			repoFullName: workspace.selectedRepo.full_name,
			bootstrap: parentData,
			slug: params.page,
			data: await response.json()
		});
		const workflowData = data.workflowData?.blockSupport ? data.workflowData : null;
		if (!workflowData) {
			return {
				...data,
				editor: data.editor
			};
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
			editor: workflowData.editor,
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
		workflow: 'page-route-shell',
		mark: 'page-route-shell-ready',
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
		editor: workflowData.editor,
		workflowData,
		pageSlug: params.page,
		mode: 'github' as const
	};
};
