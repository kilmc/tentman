import matter from 'gray-matter';
import type { ParsedContentConfig } from '$lib/config/parse';
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
		const { data, content: body } = matter(content);
		return {
			...(data as Record<string, ContentValue>),
			body,
			_filename: filename
		};
	}

	const data = JSON.parse(content) as Record<string, ContentValue>;
	return {
		...data,
		_filename: filename
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
		return matter.stringify(typeof body === 'string' ? body : '', frontmatterData);
	}

	const jsonData = { ...item };
	delete jsonData._filename;
	return toJsonFileContent(jsonData);
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
