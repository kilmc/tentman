import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderMarkdown } from '$lib/content/markdown';

export async function load() {
	const page = JSON.parse(
		await readFile(resolve(process.cwd(), 'src/content/pages/news.json'), 'utf8')
	);

	return {
		page,
		pageHtml: await renderMarkdown(page.body)
	};
}
