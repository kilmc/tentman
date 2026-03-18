import type { Octokit } from 'octokit';
import { JSONPath } from 'jsonpath-plus';
import type { Config } from '$lib/types/config';
import { resolveConfigPath } from '$lib/utils/validation';
import {
	buildCollectionFilePath,
	decodeBase64Content,
	getTemplateInfo,
	serializeCollectionItem,
	toJsonFileContent
} from '$lib/features/content-management/transforms';
import type { ContentRecord, PreviewInput } from '$lib/features/content-management/types';

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

/**
 * Calculates what files will be changed without actually committing
 */
export async function calculateChanges(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	data: ContentRecord,
	options?: Omit<PreviewInput, 'configType' | 'data'>
): Promise<ChangesSummary> {
	const files: FileChange[] = [];

	if (configType === 'singleton') {
		const change = await calculateSingletonChange(
			octokit,
			owner,
			repo,
			config,
			configPath,
			data,
			options?.branch
		);
		files.push(change);
	} else if (configType === 'array') {
		const change = await calculateArrayChange(
			octokit,
			owner,
			repo,
			config,
			configPath,
			data,
			{
				isNew: options?.isNew,
				itemId: options?.itemId,
				branch: options?.branch
			}
		);
		files.push(change);
	} else if (configType === 'collection') {
		const changes = await calculateCollectionChange(
			octokit,
			owner,
			repo,
			config,
			configPath,
			data,
			{
				isNew: options?.isNew,
				filename: options?.filename,
				newFilename: options?.newFilename,
				branch: options?.branch
			}
		);
		files.push(...changes);
	}

	return {
		files,
		totalChanges: files.length
	};
}

/**
 * Calculate changes for singleton content
 */
async function calculateSingletonChange(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configPath: string,
	data: ContentRecord,
	branch?: string
): Promise<FileChange> {
	if (!('contentFile' in config)) {
		throw new Error('Singleton config must have contentFile');
	}

	const filePath = resolveConfigPath(configPath, config.contentFile);
	const newContent = toJsonFileContent(data);

	// Try to fetch existing content
	let oldContent: string | undefined;
	let type: 'create' | 'update' = 'update';

	try {
		const { data: fileData } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: filePath,
			...(branch && { ref: branch })
		});

		if ('content' in fileData) {
			oldContent = decodeBase64Content(fileData.content);
		}
	} catch (err: unknown) {
		// File doesn't exist yet
		if (typeof err === 'object' && err !== null && 'status' in err && err.status === 404) {
			type = 'create';
		} else {
			throw err;
		}
	}

	return {
		path: filePath,
		type,
		oldContent,
		newContent,
		size: Buffer.byteLength(newContent, 'utf-8')
	};
}

/**
 * Calculate changes for array content
 */
async function calculateArrayChange(
	octokit: Octokit,
	owner: string,
	repo: string,
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

	// Fetch the current file content
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: filePath,
		...(options?.branch && { ref: options.branch })
	});

	if (!('content' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	const oldContent = decodeBase64Content(fileData.content);
	const jsonData = JSON.parse(oldContent);

	// Find the array using JSONPath
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });
	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	if (options?.isNew) {
		// Add new item
		results.push(updatedItem);
	} else {
		// Update existing item
		if (config.idField && options?.itemId !== undefined) {
			const index = results.findIndex((item) => item[config.idField!] === options.itemId);
			if (index !== -1) {
				results[index] = updatedItem;
			} else {
				throw new Error('Item not found in array');
			}
		} else {
			throw new Error('itemId is required to update array items');
		}
	}

	// Update the array in the JSON structure
	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	const newContent = toJsonFileContent(jsonData);

	return {
		path: filePath,
		type: 'update',
		oldContent,
		newContent,
		size: Buffer.byteLength(newContent, 'utf-8')
	};
}

/**
 * Calculate changes for collection content
 */
async function calculateCollectionChange(
	octokit: Octokit,
	owner: string,
	repo: string,
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
		// Creating new file
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
	} else {
		// Updating existing file
		if (!options?.filename) {
			throw new Error('Filename is required for updating collection items');
		}

		const oldFilePath = buildCollectionFilePath(templateInfo.templateDir, options.filename);

		// Try to fetch existing content
		let oldContent: string | undefined;
		try {
			const { data: fileData } = await octokit.rest.repos.getContent({
				owner,
				repo,
				path: oldFilePath,
				...(options.branch && { ref: options.branch })
			});

			if ('content' in fileData) {
				oldContent = decodeBase64Content(fileData.content);
			}
		} catch (err: unknown) {
			if (!(typeof err === 'object' && err !== null && 'status' in err && err.status === 404)) {
				throw err;
			}
		}

		// Check for filename change (rename)
		if (options.newFilename && options.newFilename !== options.filename) {
			let nextFilename = options.newFilename;
			if (!nextFilename.includes('.')) {
				nextFilename = `${nextFilename}${templateInfo.templateExt}`;
			}
			const newFilePath = buildCollectionFilePath(templateInfo.templateDir, nextFilename);

			// Delete old file
			changes.push({
				path: oldFilePath,
				type: 'delete',
				oldContent
			});

			// Create new file
			changes.push({
				path: newFilePath,
				type: 'create',
				newContent,
				size: Buffer.byteLength(newContent, 'utf-8')
			});
		} else {
			// Normal update
			changes.push({
				path: oldFilePath,
				type: 'update',
				oldContent,
				newContent,
				size: Buffer.byteLength(newContent, 'utf-8')
			});
		}
	}

	return changes;
}

/**
 * Generate a simple diff between old and new content
 */
export function generateSimpleDiff(oldContent: string, newContent: string): string {
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');

	const diff: string[] = [];
	const maxLines = Math.max(oldLines.length, newLines.length);

	for (let i = 0; i < maxLines; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];

		if (oldLine !== newLine) {
			if (oldLine !== undefined) {
				diff.push(`- ${oldLine}`);
			}
			if (newLine !== undefined) {
				diff.push(`+ ${newLine}`);
			}
		}
	}

	return diff.join('\n');
}

/**
 * Process template string by replacing {{placeholder}} with values from data
 */
function processTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return data[key] !== undefined ? String(data[key]) : match;
	});
}
