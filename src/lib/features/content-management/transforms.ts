import matter from 'gray-matter';
import type { MultiFileCollectionConfig } from '$lib/types/config';
import { resolveConfigPath } from '$lib/utils/validation';
import type { ContentRecord, TemplateInfo, ContentValue } from './types';

export function toJsonFileContent(data: ContentValue): string {
	return `${JSON.stringify(data, null, 2)}\n`;
}

export function decodeBase64Content(content: string): string {
	return Buffer.from(content, 'base64').toString('utf-8');
}

export function getTemplateInfo(configPath: string, config: MultiFileCollectionConfig): TemplateInfo {
	const resolvedTemplatePath = resolveConfigPath(configPath, config.template);
	const templateDir = resolvedTemplatePath.substring(0, resolvedTemplatePath.lastIndexOf('/')) || '';
	const templateFilename = resolvedTemplatePath.split('/').pop() ?? resolvedTemplatePath;
	const templateExt = config.template.substring(config.template.lastIndexOf('.'));

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
