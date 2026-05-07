import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
	throw redirect(302, `/pages/${params.page}/${params.itemId}/edit${url.search}`);
};
