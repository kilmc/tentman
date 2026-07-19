import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { buildReposReturnHref } from '$lib/utils/routing';
import { markWorkflowReadiness, traceBrowserRequest } from '$lib/utils/workflow-instrumentation';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch, depends }) => {
	const workspace = resolveWorkspaceState(await parent());

	if (workspace.mode === 'local') {
		throw redirect(302, '/pages');
	}

	if (workspace.mode !== 'github' || !workspace.isAuthenticated) {
		throw redirect(302, buildReposReturnHref('/repos', '/publish'));
	}

	depends('app:content');

	const response = await traceBrowserRequest(
		{
			workflow: 'publish-summary',
			route: '/publish',
			endpoint: '/api/repo/publish-view',
			priority: 'foreground',
			cacheTaskKey: null,
			duplicateState: 'unique'
		},
		() => fetch('/api/repo/publish-view')
	);
	markWorkflowReadiness({
		workflow: 'publish-summary',
		mark: 'publish-summary-first-status',
		route: '/publish'
	});

	if (response.status === 401) {
		throw redirect(302, buildReposReturnHref('/repos', '/publish'));
	}

	if (response.status === 404) {
		throw httpError(404, 'No draft branch found');
	}

	if (response.status === 413) {
		const payload = await response.json();
		markWorkflowReadiness({
			workflow: 'publish-summary',
			mark: 'publish-summary-complete',
			route: '/publish'
		});
		return {
			...payload,
			reviewModel: null
		};
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load publish view');
	}

	const payload = await response.json();
	markWorkflowReadiness({
		workflow: 'publish-summary',
		mark: 'publish-summary-complete',
		route: '/publish'
	});
	return {
		...payload,
		blockedReview: null
	};
};
