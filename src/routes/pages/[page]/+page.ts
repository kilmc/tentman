import { examples } from '$lib/examples';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { slugify } from '$lib/utils';

export const load: PageLoad = ({ params }) => {
	const page = examples.find((example) => slugify(example.label) === params.page);
	if (page) {
		return page;
	} else {
		error(404, 'Not Found');
	}
};
