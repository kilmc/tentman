import {
	getAboutPage,
	getContactPage,
	getFaqPage,
	getFeaturedPosts,
	getPublishedPosts
} from '$lib/server/content';

export async function load() {
	const [about, contact, faq, featuredPosts, posts] = await Promise.all([
		getAboutPage(),
		getContactPage(),
		getFaqPage(),
		getFeaturedPosts(2),
		getPublishedPosts()
	]);

	return {
		about,
		contact,
		faq,
		featuredPosts,
		postCount: posts.length
	};
}
