import { getPrimaryNavigation } from '$lib/server/content';

export async function load() {
	return {
		navigation: await getPrimaryNavigation()
	};
}
