import { compile } from 'mdsvex';

export async function renderMarkdown(source: string): Promise<string> {
	const rendered = await compile(source, {
		extension: '.svx'
	});

	if (typeof rendered?.code !== 'string') {
		throw new Error('Failed to render markdown');
	}

	return rendered.code.trim();
}
