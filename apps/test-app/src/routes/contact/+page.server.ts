import { getContactPage } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';

export async function load() {
	const contact = await getContactPage();

	return {
		contact,
		contactHtml: await renderMarkdown(contact.body)
	};
}
