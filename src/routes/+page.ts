import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const parentData = await parent();

	if (parentData.selectedBackend) {
		throw redirect(302, '/pages');
	}

	if (parentData.isAuthenticated) {
		throw redirect(302, '/repos');
	}

	return {};
};
