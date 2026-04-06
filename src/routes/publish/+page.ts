import { error as httpError, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch, depends }) => {
	const parentData = await parent();

	if (parentData.selectedBackend?.kind === 'local') {
		throw redirect(302, '/pages');
	}

	if (!parentData.isAuthenticated) {
		throw redirect(302, '/auth/login?redirect=/publish');
	}

	if (!parentData.selectedRepo) {
		throw redirect(302, '/repos');
	}

	depends('app:content');

	const response = await fetch('/api/repo/publish-view');

	if (response.status === 401) {
		throw redirect(302, '/auth/login?redirect=/publish');
	}

	if (response.status === 404) {
		throw httpError(404, 'No draft branch found');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load publish view');
	}

	return response.json();
};
