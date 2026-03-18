import { JSONPath } from 'jsonpath-plus';
import type { Config } from '$lib/types/config';
import { resolveConfigPath } from '$lib/utils/validation';
import {
	buildCollectionFilePath,
	detectJsonIndent,
	getTemplateInfo,
	serializeCollectionItem,
	toJsonFileContent
} from '$lib/features/content-management/transforms';
import type { ContentRecord, PreviewInput } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';

export interface FileChange {
	path: string;
	type: 'create' | 'update' | 'delete';
	oldContent?: string;
	newContent?: string;
	diff?: string;
	size?: number;
}

export interface ChangesSummary {
	files: FileChange[];
	totalChanges: number;
}

export async function calculateChanges(
	backend: RepositoryBackend,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	data: ContentRecord,
	options?: Omit<PreviewInput, 'configType' | 'data'>
): Promise<ChangesSummary> {
	const files: FileChange[] = [];

	if (configType === 'singleton') {
		files.push(await calculateSingletonChange(backend, config, configPath, data, options?.branch));
	} else if (configType === 'array') {
		files.push(
			await calculateArrayChange(backend, config, configPath, data, {
				isNew: options?.isNew,
				itemId: options?.itemId,
				branch: options?.branch
			})
		);
	} else {
		files.push(
			...(await calculateCollectionChange(backend, config, configPath, data, {
				isNew: options?.isNew,
				filename: options?.filename,
				newFilename: options?.newFilename,
				branch: options?.branch
			}))
		);
	}

	return {
		files,
		totalChanges: files.length
	};
}

async function calculateSingletonChange(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	data: ContentRecord,
	branch?: string
): Promise<FileChange> {
	if (!('contentFile' in config)) {
		throw new Error('Singleton config must have contentFile');
	}

	const filePath = resolveConfigPath(configPath, config.contentFile);

	let oldContent: string | undefined;
	let type: 'create' | 'update' = 'update';
	let indent: string | number = 2;

	try {
		oldContent = await backend.readTextFile(filePath, { ref: branch });
		indent = detectJsonIndent(oldContent);
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
			type = 'create';
		} else {
			type = (await backend.fileExists(filePath, { ref: branch })) ? 'update' : 'create';
			if (type === 'update') throw error;
		}
	}

	const newContent = toJsonFileContent(data, indent);

	return {
		path: filePath,
		type,
		oldContent,
		newContent,
		size: Buffer.byteLength(newContent, 'utf-8')
	};
}

async function calculateArrayChange(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	updatedItem: ContentRecord,
	options?: {
		isNew?: boolean;
		itemId?: string;
		branch?: string;
	}
): Promise<FileChange> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	const filePath = resolveConfigPath(configPath, config.contentFile);
	const oldContent = await backend.readTextFile(filePath, { ref: options?.branch });
	const jsonData = JSON.parse(oldContent);
	const indent = detectJsonIndent(oldContent);
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });

	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	if (options?.isNew) {
		results.push(updatedItem);
	} else {
		if (config.idField && options?.itemId !== undefined) {
			const index = results.findIndex((item) => item[config.idField!] === options.itemId);
			if (index === -1) {
				throw new Error('Item not found in array');
			}

			results[index] = updatedItem;
		} else {
			throw new Error('itemId is required to update array items');
		}
	}

	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	const newContent = toJsonFileContent(jsonData, indent);

	return {
		path: filePath,
		type: 'update',
		oldContent,
		newContent,
		size: Buffer.byteLength(newContent, 'utf-8')
	};
}

async function calculateCollectionChange(
	backend: RepositoryBackend,
	config: Config,
	configPath: string,
	newItem: ContentRecord,
	options?: {
		isNew?: boolean;
		filename?: string;
		newFilename?: string;
		branch?: string;
	}
): Promise<FileChange[]> {
	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	const templateInfo = getTemplateInfo(configPath, config);
	const newContent = serializeCollectionItem(newItem, templateInfo.isMarkdown);
	const changes: FileChange[] = [];

	if (options?.isNew) {
		let filename = options.newFilename || 'new-item';
		if (!filename.includes('.')) {
			filename = `${filename}${templateInfo.templateExt}`;
		}

		const filePath = buildCollectionFilePath(templateInfo.templateDir, filename);
		changes.push({
			path: filePath,
			type: 'create',
			newContent,
			size: Buffer.byteLength(newContent, 'utf-8')
		});
		return changes;
	}

	if (!options?.filename) {
		throw new Error('filename is required to update collection items');
	}

	const filePath = buildCollectionFilePath(templateInfo.templateDir, options.filename);
	const oldContent = await backend.readTextFile(filePath, { ref: options.branch });

	if (options.newFilename && options.newFilename !== options.filename) {
		const newFilePath = buildCollectionFilePath(templateInfo.templateDir, options.newFilename);
		changes.push({
			path: newFilePath,
			type: 'create',
			newContent,
			size: Buffer.byteLength(newContent, 'utf-8')
		});
		changes.push({
			path: filePath,
			type: 'delete',
			oldContent,
			size: Buffer.byteLength(oldContent, 'utf-8')
		});
		return changes;
	}

	changes.push({
		path: filePath,
		type: 'update',
		oldContent,
		newContent,
		size: Buffer.byteLength(newContent, 'utf-8')
	});

	return changes;
}
