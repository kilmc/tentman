import { resolve } from 'node:path';
import { getTentmanContentComponentApi } from '../server/tentman-content-components.js';

type ContentComponent = {
	definition: {
		id: string;
		name: string;
		kind: 'inline' | 'block';
	};
};
type CodeFenceMeta = {
	filename?: string;
	language: string;
	open: boolean;
};
type RenderMarkdownOptions = {
	componentsDir?: string;
	blocks?: Array<Record<string, unknown>>;
	contentItem?: Record<string, unknown> | null;
	referenceIndex?: Map<string, Map<string, unknown>>;
	resolveStructuredBlocks?: (block: Record<string, unknown>) => Array<Record<string, unknown>> | null;
};

const defaultComponentsDir = resolve(process.cwd(), 'src/lib/content-components');
const componentPromisesByDir = new Map<string, Promise<Map<string, ContentComponent>>>();
const shouldCacheComponents = !(import.meta.env?.DEV ?? false);

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

async function getComponentsByName(
	componentsDir: string = defaultComponentsDir
): Promise<Map<string, ContentComponent>> {
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

	const cachedPromise = componentPromisesByDir.get(componentsDir);
	if (cachedPromise) {
		return cachedPromise;
	}

	const { discoverContentComponents } = await getTentmanContentComponentApi();

	const componentsPromise = discoverContentComponents({
		componentsDir
	}).then((components: ContentComponent[]) => {
		const byName = new Map<string, ContentComponent>();

		for (const component of components) {
			byName.set(component.definition.name, component);
		}

		return byName;
	});
	componentPromisesByDir.set(componentsDir, componentsPromise);
	return componentsPromise;
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

function parseBlockDirective(line: string): {
	name: string;
	markdownLabel?: string;
	attributes: Record<string, string>;
} | null {
	const match = line
		.trim()
		.match(/^::([A-Za-z0-9][A-Za-z0-9-]*)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?$/);

	if (!match) {
		return null;
	}

	return {
		name: match[1],
		markdownLabel: match[2],
		attributes: parseDirectiveAttributes(match[3] ?? '')
	};
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

function renderImage(line: string): string {
	const match = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

	if (!match) {
		return `<p>${escapeHtml(line)}</p>`;
	}

	const [, alt, src] = match;
	return `<figure class="markdown-image"><img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" /></figure>`;
}

async function resolveReferenceIndex(
	options: RenderMarkdownOptions
): Promise<Map<string, Map<string, unknown>>> {
	if (options.referenceIndex) {
		return options.referenceIndex;
	}

	if (!options.contentItem || !options.blocks) {
		return new Map();
	}

	const { collectContentComponentReferenceIndex } = await getTentmanContentComponentApi();

	return collectContentComponentReferenceIndex({
		blocks: options.blocks,
		contentItem: options.contentItem,
		resolveStructuredBlocks: options.resolveStructuredBlocks ?? ((block) => block.blocks ?? null)
	}).referenceIndex as Map<string, Map<string, unknown>>;
}

async function renderResolvedDirective(
	match: {
		name: string;
		markdownLabel?: string;
		attributes: Record<string, string>;
	},
	kind: 'inline' | 'block',
	renderOptions: {
		componentsDir: string;
		contentItem: Record<string, unknown> | null;
		referenceIndex: Map<string, Map<string, unknown>>;
	}
): Promise<string> {
	const {
		normalizeContentComponentInstance,
		renderContentComponent,
		validateContentComponentInstance
	} = await getTentmanContentComponentApi();
	const componentsByName = await getComponentsByName(renderOptions.componentsDir);
	const component = componentsByName.get(match.name);

	if (!component) {
		throw new Error(`Unknown content component name: ${match.name}`);
	}

	if (component.definition.kind !== kind) {
		throw new Error(`Content component ${match.name} cannot render as ${kind}`);
	}

	const instance = normalizeContentComponentInstance(component, {
		markdownLabel: match.markdownLabel,
		attributes: match.attributes
	});
	const validationErrors = validateContentComponentInstance(component, instance, {
		referenceIndex: renderOptions.referenceIndex
	});
	if (validationErrors.length > 0) {
		throw new Error(validationErrors.join(' '));
	}

	return renderContentComponent(component, instance, {
		contentItem: renderOptions.contentItem,
		referenceIndex: renderOptions.referenceIndex
	});
}

async function renderInlineMarkdownWithOptions(
	source: string,
	renderOptions: {
		componentsDir: string;
		contentItem: Record<string, unknown> | null;
		referenceIndex: Map<string, Map<string, unknown>>;
	}
): Promise<string> {
	const directivePattern = /:([A-Za-z0-9][A-Za-z0-9-]*)\[([^\]]*)\](?:\{([^}]*)\})?/g;
	const parts: string[] = [];
	let lastIndex = 0;
	let match = directivePattern.exec(source);

	while (match) {
		if (match.index > lastIndex) {
			parts.push(renderBasicInlineMarkdown(source.slice(lastIndex, match.index)));
		}

		parts.push(
			await renderResolvedDirective(
				{
					name: match[1],
					markdownLabel: match[2],
					attributes: parseDirectiveAttributes(match[3] ?? '')
				},
				'inline',
				renderOptions
			)
		);
		lastIndex = match.index + match[0].length;
		match = directivePattern.exec(source);
	}

	if (lastIndex < source.length) {
		parts.push(renderBasicInlineMarkdown(source.slice(lastIndex)));
	}

	return parts.join('');
}

async function renderParagraphWithOptions(
	lines: string[],
	renderOptions: {
		contentItem: Record<string, unknown> | null;
		referenceIndex: Map<string, Map<string, unknown>>;
	}
): Promise<string> {
	const content = lines.map((line) => line.trim()).join(' ');
	return `<p>${await renderInlineMarkdownWithOptions(content, renderOptions)}</p>`;
}

async function renderListWithOptions(
	lines: string[],
	renderOptions: {
		contentItem: Record<string, unknown> | null;
		referenceIndex: Map<string, Map<string, unknown>>;
	}
): Promise<string> {
	const items = await Promise.all(
		lines.map(
			async (line) =>
				`<li>${await renderInlineMarkdownWithOptions(line.replace(/^- /, '').trim(), renderOptions)}</li>`
		)
	);

	return `<ul>${items.join('')}</ul>`;
}

async function renderBlockquoteWithOptions(
	lines: string[],
	options: RenderMarkdownOptions,
	renderOptions: {
		contentItem: Record<string, unknown> | null;
		referenceIndex: Map<string, Map<string, unknown>>;
	}
): Promise<string> {
	const inner = await renderMarkdown(lines.map((line) => line.replace(/^> ?/, '')).join('\n'), {
		...options,
		...renderOptions
	});
	return `<blockquote>${inner}</blockquote>`;
}

export async function renderMarkdown(
	source: string,
	options: RenderMarkdownOptions = {}
): Promise<string> {
	const normalized = source.replace(/\r\n/g, '\n').trim();

	if (!normalized) {
		return '';
	}

	const renderOptions = {
		componentsDir: options.componentsDir ?? defaultComponentsDir,
		contentItem: options.contentItem ?? null,
		referenceIndex: await resolveReferenceIndex(options)
	};
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
			blocks.push(
				`<h${level}>${await renderInlineMarkdownWithOptions(heading[2], renderOptions)}</h${level}>`
			);
			index += 1;
			continue;
		}

		const blockDirective = parseBlockDirective(line);
		if (blockDirective) {
			blocks.push(await renderResolvedDirective(blockDirective, 'block', renderOptions));
			index += 1;
			continue;
		}

		if (line.startsWith('- ')) {
			const listLines: string[] = [];

			while (index < lines.length && lines[index].trim().startsWith('- ')) {
				listLines.push(lines[index].trim());
				index += 1;
			}

			blocks.push(await renderListWithOptions(listLines, renderOptions));
			continue;
		}

		if (line.startsWith('> ')) {
			const quoteLines: string[] = [];

			while (index < lines.length && lines[index].trim().startsWith('> ')) {
				quoteLines.push(lines[index].trim());
				index += 1;
			}

			blocks.push(await renderBlockquoteWithOptions(quoteLines, options, renderOptions));
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

		blocks.push(await renderParagraphWithOptions(paragraphLines, renderOptions));
	}

	return blocks.join('\n');
}
