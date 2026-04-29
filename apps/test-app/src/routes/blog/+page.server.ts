import { getPublishedPosts } from '$lib/server/content';

export async function load() {
	return {
		posts: await getPublishedPosts()
	};
}
