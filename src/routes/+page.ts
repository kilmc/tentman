import { redirect } from '@sveltejs/kit';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const workspace = resolveWorkspaceState(await parent());

	if (workspace.mode !== 'none') {
		throw redirect(302, '/pages');
	}

	if (workspace.isAuthenticated) {
		throw redirect(302, '/repos');
	}

	return {};
};
