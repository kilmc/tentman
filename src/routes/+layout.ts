import { loadSessionBootstrap } from '$lib/auth/session';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, depends }) => {
	depends('app:session');
	return loadSessionBootstrap(fetch);
};
