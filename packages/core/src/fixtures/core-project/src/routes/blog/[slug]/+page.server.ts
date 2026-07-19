import { error } from '@sveltejs/kit';
import { getPostBySlug } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';
import { getMarkdownRenderContext } from '$lib/server/tentman-render-context';

export async function load({ params }) {
	const post = await getPostBySlug(params.slug);

	if (!post || !post.published) {
		throw error(404, 'Post not found');
	}

	const renderContext = await getMarkdownRenderContext('blog', post);

	return {
		post,
		bodyHtml: await renderMarkdown(post.body, renderContext)
	};
}
