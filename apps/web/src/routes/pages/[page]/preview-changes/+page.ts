import { error as httpError, redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';
import {
	buildPathWithQuery,
	buildReposRedirect,
	readOptionalSearchParam
} from '$lib/utils/routing';

export const load: PageLoad = async ({ parent, fetch, params, url, depends }) => {
	const workspace = resolveWorkspaceState(await parent());
	const branch = readOptionalSearchParam(url.searchParams, 'branch');
	const reposRedirect = buildReposRedirect('/repos', url);

	if (workspace.mode === 'local') {
		throw redirect(302, `/pages/${params.page}/edit`);
	}

	if (workspace.mode !== 'github' || !workspace.isAuthenticated) {
		throw redirect(302, reposRedirect);
	}

	const encodedData = url.searchParams.get('data');
	if (!encodedData) {
		throw redirect(
			302,
			buildPathWithQuery(`/pages/${params.page}/edit`, {
				branch
			})
		);
	}

	depends('app:content');

	const response = await fetch(
		buildPathWithQuery('/api/repo/page-preview', {
			slug: params.page,
			data: encodedData
		})
	);

	if (response.status === 401) {
		throw redirect(302, reposRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Configuration not found');
	}

	if (response.status === 400) {
		throw httpError(400, 'Invalid preview data');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load page preview');
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

	return {
		...data,
		branch
	};
};
