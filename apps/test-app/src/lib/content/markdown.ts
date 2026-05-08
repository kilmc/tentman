import { resolve } from 'node:path';
import { getTentmanContentComponentApi } from '$lib/server/tentman-content-components.js';

type ContentComponent = {
	definition: {
		name: string;
	};
};
type CodeFenceMeta = {
	filename?: string;
	language: string;
	open: boolean;
};

const componentsDir = resolve(process.cwd(), 'src/lib/content-components');
let componentsPromise: Promise<Map<string, ContentComponent>> | null = null;
const shouldCacheComponents = !import.meta.env.DEV;

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll("'", '&#39;');
}

function wrapToken(tokenClass: string, value: string): string {
	return `<span class="${tokenClass}">${value}</span>`;
}

function highlightJson(code: string): string {
	const escaped = escapeHtml(code);

	return escaped.replace(
		/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
		(match, quoted: string | undefined, colon: string | undefined, keyword: string | undefined, number: string | undefined) => {
			if (quoted) {
				if (colon) {
					return `${wrapToken('code-token code-token--key', quoted)}${colon}`;
				}

				return wrapToken('code-token code-token--string', quoted);
			}

			if (keyword) {
				return wrapToken('code-token code-token--keyword', keyword);
			}

			if (number) {
				return wrapToken('code-token code-token--number', number);
			}

			return match;
		}
	);
}

function highlightMarkup(code: string): string {
	let html = escapeHtml(code);

	html = html.replace(/(&lt;\/?)([A-Za-z0-9:_-]+)/g, (_match, prefix: string, tag: string) => {
		return `${wrapToken('code-token code-token--delimiter', prefix)}${wrapToken('code-token code-token--tag', tag)}`;
	});

	html = html.replace(/([A-Za-z0-9:_-]+)=(&quot;.*?&quot;)/g, (_match, name: string, value: string) => {
		return `${wrapToken('code-token code-token--attr', name)}=${wrapToken('code-token code-token--string', value)}`;
	});

	return html.replace(/(\{\{|\}\})/g, (delimiter: string) =>
		wrapToken('code-token code-token--template', delimiter)
	);
}

function highlightMarkdown(code: string): string {
	const escaped = escapeHtml(code);

	return escaped
		.replace(/^(:[A-Za-z0-9-]+\[[^\]]+\]\{[^}]+\})$/gm, (line: string) =>
			wrapToken('code-token code-token--directive', line)
		)
		.replace(/^(```.*)$/gm, (line: string) => wrapToken('code-token code-token--fence', line))
		.replace(/(\[[^\]]+\]\([^)]+\))/g, (token: string) =>
			wrapToken('code-token code-token--link', token)
		);
}

function highlightCode(code: string, language: string): string {
	switch (language) {
		case 'json':
			return highlightJson(code);
		case 'html':
		case 'njk':
		case 'svelte':
			return highlightMarkup(code);
		case 'md':
		case 'markdown':
			return highlightMarkdown(code);
		default:
			return escapeHtml(code);
	}
}

function parseCodeFenceMeta(info: string): CodeFenceMeta {
	const trimmed = info.trim();

	if (!trimmed) {
		return {
			language: 'text',
			open: false
		};
	}

	const [firstToken = 'text', ...restTokens] = trimmed.split(/\s+/);
	const meta: CodeFenceMeta = {
		language: firstToken,
		open: false
	};
	const remainder = restTokens.join(' ');

	const filenameMatch = remainder.match(/(?:filename|title)="([^"]+)"/);
	if (filenameMatch) {
		meta.filename = filenameMatch[1];
	}

	if (/\bopen\b/.test(remainder)) {
		meta.open = true;
	}

	return meta;
}

function renderCodeBlock(code: string, meta: CodeFenceMeta): string {
	const languageLabel = meta.language === 'text' ? 'code' : meta.language;
	const summary = meta.filename
		? `${escapeHtml(meta.filename)} · ${escapeHtml(languageLabel)}`
		: escapeHtml(languageLabel);

	return `<details class="code-block"${meta.open ? ' open' : ''}>
<summary>${summary}</summary>
<pre class="code-block__pre"><code class="language-${escapeAttribute(meta.language)}">${highlightCode(code, meta.language)}</code></pre>
</details>`;
}

function parseDirectiveAttributes(source: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const attributePattern = /([A-Za-z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
	let lastIndex = 0;
	let match = attributePattern.exec(source);

	while (match) {
		if (match.index !== lastIndex && source.slice(lastIndex, match.index).trim().length > 0) {
			throw new Error(`Could not parse directive attributes: ${source}`);
		}

		attributes[match[1]] = match[3] ?? match[4] ?? '';
		lastIndex = match.index + match[0].length;
		match = attributePattern.exec(source);
	}

	if (source.slice(lastIndex).trim().length > 0) {
		throw new Error(`Could not parse directive attributes: ${source}`);
	}

	return attributes;
}

async function getComponentsByName(): Promise<Map<string, ContentComponent>> {
	if (!shouldCacheComponents) {
		const { discoverContentComponents } = await getTentmanContentComponentApi();
		const components = await discoverContentComponents({
			componentsDir
		});
		const byName = new Map<string, ContentComponent>();

		for (const component of components) {
			byName.set(component.definition.name, component);
		}

		return byName;
	}

	if (!componentsPromise) {
		const { discoverContentComponents } = await getTentmanContentComponentApi();

		componentsPromise = discoverContentComponents({
			componentsDir
		}).then((components: ContentComponent[]) => {
			const byName = new Map<string, ContentComponent>();

			for (const component of components) {
				byName.set(component.definition.name, component);
			}

			return byName;
		});
	}

	return componentsPromise ?? new Map<string, ContentComponent>();
}

function renderBasicInlineMarkdown(segment: string): string {
	let html = escapeHtml(segment);

	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
		return `<a href="${escapeAttribute(href)}">${label}</a>`;
	});
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

	return html;
}

async function renderInlineMarkdown(source: string): Promise<string> {
	const componentsByName = await getComponentsByName();
	const { normalizeContentComponentInstance, renderContentComponent } =
		await getTentmanContentComponentApi();
	const directivePattern = /:([A-Za-z0-9][A-Za-z0-9-]*)\[([^\]]*)\](?:\{([^}]*)\})?/g;
	const parts: string[] = [];
	let lastIndex = 0;
	let match = directivePattern.exec(source);

	while (match) {
		if (match.index > lastIndex) {
			parts.push(renderBasicInlineMarkdown(source.slice(lastIndex, match.index)));
		}

		const componentName = match[1];
		const component = componentsByName.get(componentName);

		if (!component) {
			throw new Error(`Unknown content component name: ${componentName}`);
		}

		const instance = normalizeContentComponentInstance(component, {
			markdownLabel: match[2],
			attributes: parseDirectiveAttributes(match[3] ?? '')
		});

		parts.push(renderContentComponent(component, instance, 'render'));
		lastIndex = match.index + match[0].length;
		match = directivePattern.exec(source);
	}

	if (lastIndex < source.length) {
		parts.push(renderBasicInlineMarkdown(source.slice(lastIndex)));
	}

	return parts.join('');
}

function isStructuralLine(line: string): boolean {
	return (
		line.startsWith('#') ||
		line.startsWith('- ') ||
		line.startsWith('> ') ||
		line.startsWith('```') ||
		/^!\[[^\]]*\]\([^)]+\)$/.test(line.trim())
	);
}

async function renderParagraph(lines: string[]): Promise<string> {
	const content = lines.map((line) => line.trim()).join(' ');
	return `<p>${await renderInlineMarkdown(content)}</p>`;
}

async function renderList(lines: string[]): Promise<string> {
	const items = await Promise.all(
		lines.map(async (line) => `<li>${await renderInlineMarkdown(line.replace(/^- /, '').trim())}</li>`)
	);

	return `<ul>${items.join('')}</ul>`;
}

async function renderBlockquote(lines: string[]): Promise<string> {
	const inner = await renderMarkdown(lines.map((line) => line.replace(/^> ?/, '')).join('\n'));
	return `<blockquote>${inner}</blockquote>`;
}

function renderImage(line: string): string {
	const match = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

	if (!match) {
		return `<p>${escapeHtml(line)}</p>`;
	}

	const [, alt, src] = match;
	return `<figure class="markdown-image"><img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" /></figure>`;
}

export async function renderMarkdown(source: string): Promise<string> {
	const normalized = source.replace(/\r\n/g, '\n').trim();

	if (!normalized) {
		return '';
	}

	const lines = normalized.split('\n');
	const blocks: string[] = [];

	for (let index = 0; index < lines.length; ) {
		const line = lines[index]?.trimEnd() ?? '';

		if (!line.trim()) {
			index += 1;
			continue;
		}

		if (line.startsWith('```')) {
			const meta = parseCodeFenceMeta(line.slice(3));
			const codeLines: string[] = [];
			index += 1;

			while (index < lines.length && !lines[index].startsWith('```')) {
				codeLines.push(lines[index]);
				index += 1;
			}

			index += 1;
			blocks.push(renderCodeBlock(codeLines.join('\n'), meta));
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/);

		if (heading) {
			const level = heading[1].length;
			blocks.push(`<h${level}>${await renderInlineMarkdown(heading[2])}</h${level}>`);
			index += 1;
			continue;
		}

		if (line.startsWith('- ')) {
			const listLines: string[] = [];

			while (index < lines.length && lines[index].trim().startsWith('- ')) {
				listLines.push(lines[index].trim());
				index += 1;
			}

			blocks.push(await renderList(listLines));
			continue;
		}

		if (line.startsWith('> ')) {
			const quoteLines: string[] = [];

			while (index < lines.length && lines[index].trim().startsWith('> ')) {
				quoteLines.push(lines[index].trim());
				index += 1;
			}

			blocks.push(await renderBlockquote(quoteLines));
			continue;
		}

		if (/^!\[[^\]]*\]\([^)]+\)$/.test(line.trim())) {
			blocks.push(renderImage(line));
			index += 1;
			continue;
		}

		const paragraphLines = [line];
		index += 1;

		while (index < lines.length) {
			const nextLine = lines[index]?.trimEnd() ?? '';

			if (!nextLine.trim() || isStructuralLine(nextLine.trim())) {
				break;
			}

			paragraphLines.push(nextLine);
			index += 1;
		}

		blocks.push(await renderParagraph(paragraphLines));
	}

	return blocks.join('\n');
}
