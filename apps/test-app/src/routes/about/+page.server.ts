import { getAboutPage } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';

export async function load() {
	const about = await getAboutPage();

	return {
		about,
		aboutHtml: await renderMarkdown(about.body)
	};
}
