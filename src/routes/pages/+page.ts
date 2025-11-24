import { examples } from '$lib/examples';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	return {
		examples
	};
};
