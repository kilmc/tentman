import matter from 'gray-matter';
import type { ParsedContentConfig } from '$lib/config/parse';
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
	return Buffer.from(content, 'base64').toString('utf-8');
}

export function getTemplateInfo(configPath: string, config: DirectoryBackedConfig): TemplateInfo {
	const resolvedTemplatePath = resolveConfigPath(configPath, config.content.template);
	const templateDir = resolvedTemplatePath.substring(0, resolvedTemplatePath.lastIndexOf('/')) || '';
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

export function parseCollectionItem(content: string, isMarkdown: boolean, filename: string): ContentRecord {
	if (isMarkdown) {
		const { data, content: body } = matter(content);
		return {
			...(data as Record<string, ContentValue>),
			_body: body,
			_filename: filename
		};
	}

	const data = JSON.parse(content) as Record<string, ContentValue>;
	return {
		...data,
		_filename: filename
	};
}

export function serializeCollectionItem(item: ContentRecord, isMarkdown: boolean): string {
	if (isMarkdown) {
		const { _body, _filename, ...frontmatterData } = item;
		return matter.stringify(_body || '', frontmatterData);
	}

	const { _filename, ...jsonData } = item;
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
