import { error as httpError, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import {
	buildLoginRedirect,
	buildPathWithQuery,
	readOptionalSearchParam
} from '$lib/utils/routing';

export const load: PageLoad = async ({ parent, fetch, params, url, depends }) => {
	const parentData = await parent();
	const loginRedirect = buildLoginRedirect('/auth/login', url);
	const branch = readOptionalSearchParam(url.searchParams, 'branch');

	if (parentData.selectedBackend?.kind === 'local') {
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

	if (!parentData.isAuthenticated) {
		throw redirect(302, loginRedirect);
	}

	if (!parentData.selectedRepo) {
		throw redirect(302, '/repos');
	}

	depends('app:content');

	const response = await fetch(
		buildPathWithQuery('/api/repo/page-view', {
			slug: params.page,
			branch
		})
	);

	if (response.status === 401) {
		throw redirect(302, loginRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Configuration not found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load page view');
	}

	return response.json();
};
