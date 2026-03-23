import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { isLocalMode, requireGitHubRepository } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals }) => {
	if (isLocalMode(locals)) {
		return {};
	}

	const { backend } = requireGitHubRepository(locals, '/pages');
	const [firstConfig] = await getCachedConfigs(backend);

	if (firstConfig) {
		throw redirect(302, `/pages/${firstConfig.slug}`);
	}

	return {};
};
