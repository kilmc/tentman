import { error as httpError, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import {
	buildPathWithQuery,
	buildReposRedirect,
	readOptionalSearchParam
} from '$lib/utils/routing';

export const load: PageLoad = async ({ parent, fetch, params, url, depends }) => {
	const parentData = await parent();
	const reposRedirect = buildReposRedirect('/repos', url);

	if (parentData.selectedBackend?.kind === 'local') {
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

	if (!parentData.isAuthenticated) {
		throw redirect(302, reposRedirect);
	}

	if (!parentData.selectedRepo) {
		throw redirect(302, '/repos');
	}

	depends('app:content');

	const branch = readOptionalSearchParam(url.searchParams, 'branch');
	const response = await fetch(
		buildPathWithQuery('/api/repo/item-view', {
			slug: params.page,
			itemId: params.itemId,
			branch
		})
	);

	if (response.status === 401) {
		throw redirect(302, reposRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Item not found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load item view');
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

	return data;
};
