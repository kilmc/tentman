import { error as httpError, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import {
	buildLoginRedirect,
	buildPathWithQuery,
	readOptionalSearchParam
} from '$lib/utils/routing';

export const load: PageLoad = async ({ parent, fetch, params, depends, url }) => {
	const parentData = await parent();
	const loginRedirect = buildLoginRedirect('/auth/login', url);
	const branch = readOptionalSearchParam(url.searchParams, 'branch');

	if (parentData.selectedBackend?.kind === 'local') {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null,
			branch: null,
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
		buildPathWithQuery('/api/repo/form-config', {
			slug: params.page
		})
	);

	if (response.status === 401) {
		throw redirect(302, loginRedirect);
	}

	if (response.status === 404) {
		throw httpError(404, 'Configuration not found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load form config');
	}

	const data = await response.json();

	if (!data?.discoveredConfig?.config?.collection) {
		throw redirect(302, `/pages/${params.page}`);
	}

	return {
		...data,
		branch
	};
};
