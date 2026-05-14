import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderMarkdown } from '$lib/content/markdown';
import { getMarkdownRenderContext } from '$lib/server/tentman-render-context';

export async function load() {
	const page = JSON.parse(
		await readFile(resolve(process.cwd(), 'src/content/pages/projects.json'), 'utf8')
	);
	const renderContext = await getMarkdownRenderContext('projects', page);

	return {
		page,
		pageHtml: await renderMarkdown(page.body, renderContext)
	};
}
