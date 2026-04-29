import { getAboutPage, getContactPage, getPublishedPosts } from '$lib/server/content';

export async function load() {
	const [about, contact, posts] = await Promise.all([
		getAboutPage(),
		getContactPage(),
		getPublishedPosts()
	]);

	return {
		about,
		contact,
		posts: posts.slice(0, 2)
	};
}
