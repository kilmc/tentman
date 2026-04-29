import { error } from '@sveltejs/kit';
import { getPostBySlug } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';

export async function load({ params }) {
	const post = await getPostBySlug(params.slug);

	if (!post || !post.published) {
		throw error(404, 'Post not found');
	}

	return {
		post,
		bodyHtml: await renderMarkdown(post.body)
	};
}
