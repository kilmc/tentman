import { redirect } from '@sveltejs/kit';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	loadRepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, depends, parent }) => {
	const parentData = await parent();

	if (
		parentData.selectedBackend?.kind === 'local' ||
		!parentData.isAuthenticated ||
		!parentData.selectedRepo
	) {
		return {
			...EMPTY_REPO_CONFIGS_BOOTSTRAP
		};
	}

	depends('app:repo-configs');

	try {
		return await loadRepoConfigsBootstrap(fetch);
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
			throw redirect(302, '/auth/login?redirect=/pages');
		}

		throw error;
	}
};
