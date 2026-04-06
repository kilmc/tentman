import { error as httpError, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch, depends }) => {
	const parentData = await parent();

	if (!parentData.isAuthenticated) {
		throw redirect(302, '/auth/login?redirect=/repos');
	}

	depends('app:repos');

	const response = await fetch('/api/repos');

	if (response.status === 401) {
		throw redirect(302, '/auth/login?redirect=/repos');
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load repositories');
	}

	return response.json();
};
