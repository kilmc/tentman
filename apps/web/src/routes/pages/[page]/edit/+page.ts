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
			branch: null,
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
	const discoveredConfig = parentData.configs?.find((config) => config.slug === params.page) ?? null;
	const cachedSingleton = await githubRepositoryCache.getSingletonDocumentForRoute({
		slug: params.page
	});
	if (discoveredConfig && cachedSingleton?.blockSupport) {
		if (discoveredConfig.config.collection) {
			throw redirect(302, `/pages/${params.page}`);
		}

		return {
			discoveredConfig,
			blockConfigs: cachedSingleton.blockSupport.blockConfigs,
			packageBlocks: cachedSingleton.blockSupport.packageBlocks,
			blockRegistryError: cachedSingleton.blockSupport.blockRegistryError,
			content: cachedSingleton.content,
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
		throw httpError(response.status, 'Failed to load edit view');
	}

	const data = await response.json();

	if (data?.discoveredConfig?.config?.collection) {
		throw redirect(302, `/pages/${params.page}`);
	}

	await githubRepositoryCache.setSingletonPageView({
		slug: params.page,
		content: data.content ?? null,
		blockConfigs: data.blockConfigs,
		packageBlocks: data.packageBlocks,
		blockRegistryError: data.blockRegistryError ?? null
	});

	return data;
};
