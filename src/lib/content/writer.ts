import { JSONPath } from 'jsonpath-plus';
import { generateCommitMessage } from '$lib/github/commit';
import type { Config } from '$lib/types/config';
import { normalizeFields } from '$lib/types/config';
import { resolveConfigPath } from '$lib/utils/validation';
import {
	buildCollectionFilePath,
	detectJsonIndent,
	getTemplateInfo,
	processTemplate,
	serializeCollectionItem,
	toJsonFileContent
} from '$lib/features/content-management/transforms';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';

type WriterSaveOptions = {
	itemIndex?: number;
	itemId?: string;
	filename?: string;
	newFilename?: string;
	branch?: string;
};

type WriterDeleteOptions = {
	itemIndex?: number;
	itemId?: string;
	filename?: string;
	branch?: string;
};

function toWriteOptions(branch: string | undefined, message: string): RepositoryWriteOptions {
	return { ref: branch, message };
}

export async function saveContent(
	backend: RepositoryBackend,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	data: ContentRecord,
	options?: WriterSaveOptions
): Promise<void> {
	if (configType === 'singleton') {
		await saveSingleton(backend, config, configPath, data, options?.branch);
		return;
	}

	if (configType === 'array') {
		await saveArrayItem(backend, config, configPath, data, options);
		return;
	}

	await saveCollectionItem(backend, config, configPath, data, options);
}

export async function createContent(
	backend: RepositoryBackend,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	data: ContentRecord,
	options?: {
		filename?: string;
		branch?: string;
	}
): Promise<void> {
	if (configType === 'array') {
		await createArrayItem(backend, config, configPath, data, options?.branch);
		return;
	}

	if (configType === 'collection') {
		await createCollectionItem(backend, config, configPath, data, options);
		return;
	}

	throw new Error('Cannot create items for singleton configs');
}

export async function deleteContent(
	backend: RepositoryBackend,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	options: WriterDeleteOptions
): Promise<void> {
	if (configType === 'array') {
		await deleteArrayItem(backend, config, configPath, options);
		return;
	}

	if (configType === 'collection') {
		await deleteCollectionItem(backend, config, configPath, options);
		return;
	}

	throw new Error('Cannot delete items from singleton configs');
}

async function saveSingleton(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	data: ContentRecord,
	branch?: string
): Promise<void> {
	if (!('contentFile' in config)) {
		throw new Error('Singleton config must have contentFile');
	}

	const content = toJsonFileContent(data);
	const message = generateCommitMessage('update', config.label);
	const filePath = resolveConfigPath(configPath, config.contentFile);
	const existingContent = await backend.readTextFile(filePath, { ref: branch });
	const indent = detectJsonIndent(existingContent);

	await backend.writeTextFile(filePath, toJsonFileContent(data, indent), toWriteOptions(branch, message));
}

async function saveArrayItem(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	updatedItem: ContentRecord,
	options?: {
		itemIndex?: number;
		itemId?: string;
		branch?: string;
	}
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	const filePath = resolveConfigPath(configPath, config.contentFile);
	const existingContent = await backend.readTextFile(filePath, { ref: options?.branch });
	const jsonData = JSON.parse(existingContent);
	const indent = detectJsonIndent(existingContent);
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });

	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	let itemIdentifier: string | undefined;
	let itemFound = false;

	if (config.idField && options?.itemId !== undefined) {
		const index = results.findIndex((item) => item[config.idField!] === options.itemId);
		if (index !== -1) {
			results[index] = updatedItem;
			itemIdentifier = String(options.itemId);
			itemFound = true;
		}
	} else if (options?.itemIndex !== undefined) {
		if (options.itemIndex >= 0 && options.itemIndex < results.length) {
			results[options.itemIndex] = updatedItem;
			itemIdentifier = config.idField
				? String(updatedItem[config.idField])
				: `item ${options.itemIndex + 1}`;
			itemFound = true;
		}
	}

	if (!itemFound) {
		throw new Error('Item not found in array');
	}

	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	const updatedContent = toJsonFileContent(jsonData, indent);
	const message = generateCommitMessage('update', config.label, itemIdentifier);

	await backend.writeTextFile(filePath, updatedContent, toWriteOptions(options?.branch, message));
}

async function saveCollectionItem(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	updatedItem: ContentRecord,
	options?: WriterSaveOptions
): Promise<void> {
	if (!options?.filename) {
		throw new Error('Filename is required to save collection item');
	}

	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	const templateInfo = getTemplateInfo(configPath, config);
	const oldFilePath = buildCollectionFilePath(templateInfo.templateDir, options.filename);
	const content = serializeCollectionItem(updatedItem, templateInfo.isMarkdown);
	const itemIdentifier = config.idField ? String(updatedItem[config.idField]) : options.filename;

	if (options.newFilename && options.newFilename !== options.filename) {
		const newFilePath = buildCollectionFilePath(templateInfo.templateDir, options.newFilename);
		const message = generateCommitMessage(
			'rename',
			config.label,
			`${options.filename} → ${options.newFilename}`
		);

		await backend.writeTextFile(newFilePath, content, toWriteOptions(options.branch, message));
		await backend.deleteFile(oldFilePath, toWriteOptions(options.branch, message));
		return;
	}

	const message = generateCommitMessage('update', config.label, itemIdentifier);
	await backend.writeTextFile(oldFilePath, content, toWriteOptions(options.branch, message));
}

async function createArrayItem(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	newItem: ContentRecord,
	branch?: string
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	const filePath = resolveConfigPath(configPath, config.contentFile);
	const existingContent = await backend.readTextFile(filePath, { ref: branch });
	const jsonData = JSON.parse(existingContent);
	const indent = detectJsonIndent(existingContent);
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });

	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	if (config.idField) {
		const normalizedFields = normalizeFields(config.fields);
		const fieldDef = normalizedFields[config.idField];
		if (typeof fieldDef === 'object' && 'generated' in fieldDef && fieldDef.generated) {
			newItem[config.idField] = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		}
	}

	results.push(newItem);

	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	const updatedContent = toJsonFileContent(jsonData, indent);
	const itemIdentifier = config.idField ? String(newItem[config.idField]) : 'new item';
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	await backend.writeTextFile(filePath, updatedContent, toWriteOptions(branch, message));
}

async function createCollectionItem(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	newItem: ContentRecord,
	options?: {
		filename?: string;
		branch?: string;
	}
): Promise<void> {
	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	const templateInfo = getTemplateInfo(configPath, config);
	const template = await backend.readTextFile(templateInfo.resolvedTemplatePath, { ref: options?.branch });

	let content: string;
	if (templateInfo.isMarkdown) {
		const matter = await import('gray-matter');
		const { data: templateFrontmatter, content: templateBody } = matter.default(template);
		const { _body, _filename, ...frontmatterData } = newItem;
		const body = _body !== undefined ? _body : processTemplate(templateBody, newItem);
		const mergedFrontmatter = { ...templateFrontmatter, ...frontmatterData };
		const processedFrontmatter: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(mergedFrontmatter)) {
			processedFrontmatter[key] = typeof value === 'string' ? processTemplate(value, newItem) : value;
		}

		content = matter.stringify(body, processedFrontmatter);
	} else {
		content = processTemplate(template, newItem);
	}

	let filename = options?.filename || 'new-item';
	if (!filename.includes('.')) {
		filename = `${filename}${templateInfo.templateExt}`;
	}

	const filePath = buildCollectionFilePath(templateInfo.templateDir, filename);
	const itemIdentifier = config.idField ? String(newItem[config.idField]) : filename;
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	await backend.writeTextFile(filePath, content, toWriteOptions(options?.branch, message));
}

async function deleteArrayItem(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	options: {
		itemIndex?: number;
		itemId?: string;
		branch?: string;
	}
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	const filePath = resolveConfigPath(configPath, config.contentFile);
	const existingContent = await backend.readTextFile(filePath, { ref: options.branch });
	const jsonData = JSON.parse(existingContent);
	const indent = detectJsonIndent(existingContent);
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });

	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	let itemIdentifier: string | undefined;
	let itemFound = false;

	if (config.idField && options.itemId !== undefined) {
		const index = results.findIndex((item) => item[config.idField!] === options.itemId);
		if (index !== -1) {
			itemIdentifier = String(options.itemId);
			results.splice(index, 1);
			itemFound = true;
		}
	} else if (options.itemIndex !== undefined) {
		if (options.itemIndex >= 0 && options.itemIndex < results.length) {
			const item = results[options.itemIndex];
			itemIdentifier = config.idField
				? String(item[config.idField])
				: `item ${options.itemIndex + 1}`;
			results.splice(options.itemIndex, 1);
			itemFound = true;
		}
	}

	if (!itemFound) {
		throw new Error('Item not found in array');
	}

	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	const updatedContent = toJsonFileContent(jsonData, indent);
	const message = generateCommitMessage('delete', config.label, itemIdentifier);

	await backend.writeTextFile(filePath, updatedContent, toWriteOptions(options.branch, message));
}

async function deleteCollectionItem(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	options: {
		filename?: string;
		itemId?: string;
		branch?: string;
	}
): Promise<void> {
	if (!options.filename) {
		throw new Error('Filename is required to delete collection item');
	}

	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	const templateInfo = getTemplateInfo(configPath, config);
	const filePath = buildCollectionFilePath(templateInfo.templateDir, options.filename);
	const itemIdentifier = options.itemId || options.filename;
	const message = generateCommitMessage('delete', config.label, itemIdentifier);

	await backend.deleteFile(filePath, toWriteOptions(options.branch, message));
}
