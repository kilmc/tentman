import matter from 'gray-matter';
import type { ParsedContentConfig } from '$lib/config/parse';
import { getItemId, getItemSlug } from '$lib/features/content-management/item';
import { decodeBase64ToUtf8 } from '$lib/utils/text';
import { resolveConfigPath } from '$lib/utils/validation';
import type { ContentRecord, TemplateInfo, ContentValue } from './types';

type DirectoryBackedConfig = ParsedContentConfig & {
	content: {
		mode: 'directory';
		path: string;
		template: string;
		filename?: string;
	};
};

export function detectJsonIndent(content: string): string | number {
	const match = content.match(/^[ \t]+(?=")/m);
	if (!match) {
		return 2;
	}

	return match[0].includes('\t') ? '\t' : match[0].length;
}

export function toJsonFileContent(data: ContentValue, indent: string | number = 2): string {
	return `${JSON.stringify(data, null, indent)}\n`;
}

export function isMarkdownContentPath(path: string): boolean {
	return path.endsWith('.md') || path.endsWith('.markdown');
}

export function decodeBase64Content(content: string): string {
	return decodeBase64ToUtf8(content);
}

export function getTemplateInfo(configPath: string, config: DirectoryBackedConfig): TemplateInfo {
	const resolvedTemplatePath = resolveConfigPath(configPath, config.content.template);
	const templateDir =
		resolvedTemplatePath.substring(0, resolvedTemplatePath.lastIndexOf('/')) || '';
	const templateFilename = resolvedTemplatePath.split('/').pop() ?? resolvedTemplatePath;
	const templateExt = config.content.template.substring(config.content.template.lastIndexOf('.'));

	return {
		resolvedTemplatePath,
		templateDir,
		templateExt,
		templateFilename,
		isMarkdown: isMarkdownContentPath(resolvedTemplatePath)
	};
}

export function parseCollectionItem(
	content: string,
	isMarkdown: boolean,
	filename: string
): ContentRecord {
	if (isMarkdown) {
		return {
			...(parseMarkdownContentRecord(content) as Record<string, ContentValue>),
			_filename: filename
		};
	}

	const data = JSON.parse(content) as Record<string, ContentValue>;
	return {
		...data,
		_filename: filename
	};
}

export function parseMarkdownContentRecord(content: string): ContentRecord {
	ensureBufferGlobal();

	try {
		const parsed = matter(content);
		const frontmatterData =
			parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
				? { ...parsed.data }
				: {};
		const frontmatterBody =
			typeof frontmatterData.body === 'string' ? frontmatterData.body : undefined;
		delete frontmatterData.body;

		return {
			...frontmatterData,
			body: parsed.content.length > 0 ? parsed.content : (frontmatterBody ?? '')
		} as ContentRecord;
	} catch (error) {
		const recovered = recoverMalformedMarkdownFrontmatter(content);
		if (recovered) {
			const frontmatterData = { ...recovered.data };
			const frontmatterBody =
				typeof frontmatterData.body === 'string' ? frontmatterData.body : undefined;
			delete frontmatterData.body;

			return {
				...frontmatterData,
				body: recovered.body.length > 0 ? recovered.body : (frontmatterBody ?? '')
			} as ContentRecord;
		}

		throw error;
	}
}

function assertSerializableContentRecord(item: ContentRecord): void {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		throw new Error('Content item must be an object before it can be saved.');
	}

	const numericKeys = Object.keys(item).filter((key) => /^\d+$/.test(key));
	if (numericKeys.length > 0) {
		throw new Error(
			`Content item contains unexpected numeric keys (${numericKeys.slice(0, 5).join(', ')}). This usually means a text field was accidentally spread into the saved record.`
		);
	}
}

export function serializeCollectionItem(item: ContentRecord, isMarkdown: boolean): string {
	assertSerializableContentRecord(item);

	if (isMarkdown) {
		const normalizedItem = { ...item };
		delete normalizedItem._filename;
		return serializeMarkdownContentRecord(normalizedItem);
	}

	const jsonData = { ...item };
	delete jsonData._filename;
	return toJsonFileContent(jsonData);
}

export function serializeMarkdownContentRecord(item: ContentRecord): string {
	ensureBufferGlobal();
	assertSerializableContentRecord(item);

	const normalizedItem = { ...item };
	delete normalizedItem._filename;
	const { body, ...frontmatterData } = normalizedItem;
	const frontmatterOnly = matter.stringify('', frontmatterData);
	const normalizedFrontmatter = frontmatterOnly.endsWith('\n\n')
		? frontmatterOnly.slice(0, -1)
		: frontmatterOnly;
	const normalizedBody = typeof body === 'string' ? body : '';

	if (normalizedBody.length === 0) {
		return normalizedFrontmatter;
	}

	return `${normalizedFrontmatter}${normalizedBody}`;
}

export function stringifyMarkdownCollectionItem(
	body: string,
	frontmatterData: Record<string, unknown>
): string {
	return serializeMarkdownContentRecord({
		...frontmatterData,
		body
	} as ContentRecord);
}

function recoverMalformedMarkdownFrontmatter(source: string) {
	if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
		return null;
	}

	if (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(source)) {
		return null;
	}

	const lines = source.split(/\r?\n/);
	let lastValid: { endLine: number; data: Record<string, unknown> } | null = null;

	for (let index = 1; index < lines.length; index += 1) {
		const candidate = lines.slice(1, index + 1).join('\n');

		try {
			const parsed = matter(`---\n${candidate}\n---\n`);
			if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
				break;
			}

			lastValid = {
				endLine: index,
				data: parsed.data as Record<string, unknown>
			};
		} catch {
			break;
		}
	}

	if (!lastValid) {
		return null;
	}

	return {
		data: lastValid.data,
		body: lines.slice(lastValid.endLine + 1).join('\n').replace(/^\n/, '')
	};
}

function ensureBufferGlobal(): void {
	if (typeof globalThis.Buffer === 'undefined') {
		globalThis.Buffer = {
			from(input: string) {
				return input;
			}
		} as typeof globalThis.Buffer;
	}
}

export function processTemplate(template: string, data: ContentRecord): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		const value = data[key];
		return value !== undefined ? String(value) : match;
	});
}

export function buildCollectionFilePath(templateDir: string, filename: string): string {
	return templateDir ? `${templateDir}/${filename}` : filename;
}

export function stripFileExtension(filename: string): string {
	return filename.replace(/\.[^/.]+$/, '');
}

export function getCollectionFilenameBase(
	config: DirectoryBackedConfig,
	data: ContentRecord
): string {
	if (config.content.filename) {
		return processTemplate(config.content.filename, data);
	}

	return getItemSlug(config, data) ?? getItemId(data) ?? 'item';
}
