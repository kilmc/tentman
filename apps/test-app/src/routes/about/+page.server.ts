import { getAboutPage } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';
import { getMarkdownRenderContext } from '$lib/server/tentman-render-context';

export async function load() {
	const about = await getAboutPage();
	const renderContext = await getMarkdownRenderContext('about', about);

	return {
		about,
		aboutHtml: await renderMarkdown(about.body, renderContext)
	};
}
