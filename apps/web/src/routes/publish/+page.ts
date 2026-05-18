import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { buildReposReturnHref } from '$lib/utils/routing';
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

	const response = await fetch('/api/repo/publish-view');

	if (response.status === 401) {
		throw redirect(302, buildReposReturnHref('/repos', '/publish'));
	}

	if (response.status === 404) {
		throw httpError(404, 'No draft branch found');
	}

	if (response.status === 409) {
		throw httpError(
			409,
			'Tentman found conflicting draft branches. Merge or delete them before continuing.'
		);
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load publish view');
	}

	return response.json();
};
