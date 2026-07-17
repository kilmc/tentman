import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import { buildReposRedirect } from '$lib/utils/routing';
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
			branch: null,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	if (workspace.mode !== 'github' || !workspace.isAuthenticated) {
		throw redirect(302, reposRedirect);
	}

	depends('app:content');

	const workflowResult = await githubWorkflowRouteCapabilities.loadSingletonEditWorkflowData({
		repoFullName: workspace.selectedRepo.full_name,
		bootstrap: parentData,
		slug: params.page,
		fetcher: fetch
	});

	if (workflowResult.status === 'ready') {
		markWorkflowReadiness({
			workflow: 'page-route-shell',
			mark: 'page-route-shell-ready',
			route: `/pages/${params.page}/edit`,
			slug: params.page
		});
		return workflowResult.data;
	}

	if (workflowResult.status === 'unauthorized') {
		throw redirect(302, reposRedirect);
	}

	if (workflowResult.status === 'missing') {
		throw httpError(404, 'Configuration not found');
	}

	if (workflowResult.status === 'collection') {
		throw redirect(302, `/pages/${params.page}`);
	}

	throw httpError(workflowResult.httpStatus, 'Failed to load edit view');
};
