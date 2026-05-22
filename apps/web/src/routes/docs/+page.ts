import { redirect } from '@sveltejs/kit';
import { defaultDocsPage } from '$lib/docs/content';

export function load() {
	throw redirect(307, defaultDocsPage.href);
}
