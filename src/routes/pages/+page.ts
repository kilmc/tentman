import { redirect } from '@sveltejs/kit';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const data = await parent();

	if (data.selectedBackend?.kind === 'local') {
		return {};
	}

	if (!data.isAuthenticated) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!data.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const firstConfig = orderDiscoveredConfigs(data.configs, data.navigationManifest.manifest)[0];
	if (firstConfig) {
		throw redirect(302, `/pages/${firstConfig.slug}`);
	}

	return {};
};
