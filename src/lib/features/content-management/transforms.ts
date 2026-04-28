import matter from 'gray-matter';
import type { ParsedContentConfig } from '$lib/config/parse';
import { getItemId, getItemSlug } from '$lib/features/content-management/item';
import { decodeBase64ToUtf8, ensureBufferGlobal } from '$lib/utils/text';
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
		isMarkdown: templateExt === '.md' || templateExt === '.markdown'
	};
}

export function parseCollectionItem(
	content: string,
	isMarkdown: boolean,
	filename: string
): ContentRecord {
	if (isMarkdown) {
		ensureBufferGlobal();
		try {
			const { data, content: body } = matter(content);
			return {
				...(data as Record<string, ContentValue>),
				body,
				_filename: filename
			};
		} catch (error) {
			const recovered = recoverMalformedMarkdownFrontmatter(content);
			if (!recovered) {
				throw error;
			}

			return {
				...recovered.data,
				body: recovered.body,
				_filename: filename
			};
		}
	}

	const data = JSON.parse(content) as Record<string, ContentValue>;
	return {
		...data,
		_filename: filename
	};
}

function recoverMalformedMarkdownFrontmatter(content: string): {
	data: Record<string, ContentValue>;
	body: string;
} | null {
	if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
		return null;
	}

	if (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(content)) {
		return null;
	}

	const lines = content.split(/\r?\n/);
	let lastValid: { endLine: number; data: Record<string, ContentValue> } | null = null;

	for (let index = 1; index < lines.length; index += 1) {
		const candidate = lines.slice(1, index + 1).join('\n');

		try {
			const parsed = matter(`---\n${candidate}\n---\n`);
			if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
				break;
			}

			lastValid = {
				endLine: index,
				data: parsed.data as Record<string, ContentValue>
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
		ensureBufferGlobal();
		const { body, ...frontmatterData } = item;
		delete frontmatterData._filename;
		return stringifyMarkdownCollectionItem(
			typeof body === 'string' ? body : '',
			frontmatterData as Record<string, unknown>
		);
	}

	const jsonData = { ...item };
	delete jsonData._filename;
	return toJsonFileContent(jsonData);
}

export function stringifyMarkdownCollectionItem(
	body: string,
	frontmatterData: Record<string, unknown>
): string {
	const frontmatterOnly = matter.stringify('', frontmatterData);
	const normalizedFrontmatter = frontmatterOnly.endsWith('\n\n')
		? frontmatterOnly.slice(0, -1)
		: frontmatterOnly;

	if (body.length === 0) {
		return normalizedFrontmatter;
	}

	return `${normalizedFrontmatter}${body}`;
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
