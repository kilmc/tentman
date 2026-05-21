import { error } from '@sveltejs/kit';
import { getDocsPageBySlug } from '$lib/docs/content';

export function load({ params }) {
	const doc = getDocsPageBySlug(params.slug);

	if (!doc) {
		throw error(404, 'Documentation page not found');
	}

	return { doc };
}
