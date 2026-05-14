import { getContactPage } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';
import { getMarkdownRenderContext } from '$lib/server/tentman-render-context';

export async function load() {
	const contact = await getContactPage();
	const renderContext = await getMarkdownRenderContext('contact', contact);

	return {
		contact,
		contactHtml: await renderMarkdown(contact.body, renderContext)
	};
}
