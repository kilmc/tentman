import type { Octokit } from 'octokit';
import { JSONPath } from 'jsonpath-plus';
import { updateFile, generateCommitMessage } from '$lib/github/commit';
import type { Config } from '$lib/types/config';
import { normalizeFields } from '$lib/types/config';
import { resolveConfigPath } from '$lib/utils/validation';
import {
	buildCollectionFilePath,
	decodeBase64Content,
	getTemplateInfo,
	processTemplate,
	serializeCollectionItem,
	toJsonFileContent
} from '$lib/features/content-management/transforms';
import type {
	ContentRecord,
} from '$lib/features/content-management/types';

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

/**
 * Saves content back to the repository based on config type
 * @param configPath - Path to the config file (for resolving relative paths)
 * @param branch - Optional branch name to commit to (defaults to default branch)
 */
export async function saveContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	data: ContentRecord,
	options?: WriterSaveOptions
): Promise<void> {
	if (configType === 'singleton') {
		await saveSingleton(octokit, owner, repo, config, configPath, data, options?.branch);
	} else if (configType === 'array') {
		await saveArrayItem(octokit, owner, repo, config, configPath, data, options);
	} else if (configType === 'collection') {
		await saveCollectionItem(octokit, owner, repo, config, configPath, data, options);
	}
}

/**
 * Creates a new item in an array or collection
 * @param configPath - Path to the config file (for resolving relative paths)
 * @param branch - Optional branch name to commit to (defaults to default branch)
 */
export async function createContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	data: ContentRecord,
	options?: {
		filename?: string; // For collection items - manual filename entry
		branch?: string;
	}
): Promise<void> {
	if (configType === 'array') {
		await createArrayItem(octokit, owner, repo, config, configPath, data, options?.branch);
	} else if (configType === 'collection') {
		await createCollectionItem(octokit, owner, repo, config, configPath, data, {
			filename: options?.filename,
			branch: options?.branch
		});
	} else {
		throw new Error('Cannot create items for singleton configs');
	}
}

/**
 * Deletes an item from an array or collection
 * @param configPath - Path to the config file (for resolving relative paths)
 * @param branch - Optional branch name to commit to (defaults to default branch)
 */
export async function deleteContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	configPath: string,
	options: WriterDeleteOptions
): Promise<void> {
	if (configType === 'array') {
		await deleteArrayItem(octokit, owner, repo, config, configPath, options);
	} else if (configType === 'collection') {
		await deleteCollectionItem(octokit, owner, repo, config, configPath, options);
	} else {
		throw new Error('Cannot delete items from singleton configs');
	}
}

/**
 * Saves singleton content (single JSON file)
 */
async function saveSingleton(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configPath: string,
	data: ContentRecord,
	branch?: string
): Promise<void> {
	if (!('contentFile' in config)) {
		throw new Error('Singleton config must have contentFile');
	}

	// Serialize data to JSON with nice formatting
	const content = toJsonFileContent(data);

	// Generate commit message
	const message = generateCommitMessage('update', config.label);

	// Resolve path relative to config file location
	const filePath = resolveConfigPath(configPath, config.contentFile);

	// Update the file
	await updateFile(octokit, owner, repo, filePath, content, message, branch);
}

/**
 * Saves an item in a single-file array
 */
async function saveArrayItem(
	octokit: Octokit,
	owner: string,
	repo: string,
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

	// Resolve path relative to config file location
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

	// Decode and parse the JSON
	const content = decodeBase64Content(fileData.content);
	const jsonData = JSON.parse(content);

	// Find the array using JSONPath
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });
	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	// Find and update the item
	let itemIdentifier: string | undefined;
	let itemFound = false;

	if (config.idField && options?.itemId !== undefined) {
		// Update by ID field
		const index = results.findIndex((item) => item[config.idField!] === options.itemId);
		if (index !== -1) {
			results[index] = updatedItem;
			itemIdentifier = String(options.itemId);
			itemFound = true;
		}
	} else if (options?.itemIndex !== undefined) {
		// Update by index
		if (options.itemIndex >= 0 && options.itemIndex < results.length) {
			results[options.itemIndex] = updatedItem;
			itemIdentifier = config.idField ? String(updatedItem[config.idField]) : `item ${options.itemIndex + 1}`;
			itemFound = true;
		}
	}

	if (!itemFound) {
		throw new Error('Item not found in array');
	}

	// Update the array in the original JSON structure
	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	// Serialize back to JSON
	const updatedContent = JSON.stringify(jsonData, null, 2) + '\n';

	// Generate commit message
	const message = generateCommitMessage('update', config.label, itemIdentifier);

	// Update the file
	await updateFile(octokit, owner, repo, filePath, updatedContent, message, options?.branch);
}

/**
 * Saves an item in a multi-file collection (markdown or JSON)
 */
async function saveCollectionItem(
	octokit: Octokit,
	owner: string,
	repo: string,
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

	// Generate commit message
	const itemIdentifier = config.idField ? String(updatedItem[config.idField]) : options.filename;

	// Handle filename change (rename)
	if (options.newFilename && options.newFilename !== options.filename) {
		const newFilePath = buildCollectionFilePath(templateInfo.templateDir, options.newFilename);

		// Get the old file SHA (required for deletion)
		const { data: oldFileData } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: oldFilePath,
			...(options.branch && { ref: options.branch })
		});

		if (!('sha' in oldFileData)) {
			throw new Error('Expected file, got directory');
		}

		// Create new file with updated content
		const createMessage = generateCommitMessage('rename', config.label, `${options.filename} → ${options.newFilename}`);
		await updateFile(octokit, owner, repo, newFilePath, content, createMessage, options.branch);

		// Delete old file
		await octokit.rest.repos.deleteFile({
			owner,
			repo,
			path: oldFilePath,
			message: createMessage,
			sha: oldFileData.sha,
			...(options.branch && { branch: options.branch })
		});
	} else {
		// Normal update (no rename)
		const message = generateCommitMessage('update', config.label, itemIdentifier);
		await updateFile(octokit, owner, repo, oldFilePath, content, message, options.branch);
	}
}

/**
 * Creates a new item in a single-file array
 */
async function createArrayItem(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configPath: string,
	newItem: ContentRecord,
	branch?: string
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	// Resolve path relative to config file location
	const filePath = resolveConfigPath(configPath, config.contentFile);

	// Fetch the current file content
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: filePath,
		...(branch && { ref: branch })
	});

	if (!('content' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	// Decode and parse the JSON
	const content = decodeBase64Content(fileData.content);
	const jsonData = JSON.parse(content);

	// Find the array using JSONPath
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });
	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	// Generate ID if configured
	if (config.idField) {
		const normalizedFields = normalizeFields(config.fields);
		const fieldDef = normalizedFields[config.idField];
		if (typeof fieldDef === 'object' && 'generated' in fieldDef && fieldDef.generated) {
			// Generate a simple unique ID (timestamp-based)
			newItem[config.idField] = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		}
	}

	// Add the new item to the array
	results.push(newItem);

	// Update the array in the original JSON structure
	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	// Serialize back to JSON
	const updatedContent = toJsonFileContent(jsonData);

	// Generate commit message
	const itemIdentifier = config.idField ? String(newItem[config.idField]) : 'new item';
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	// Update the file
	await updateFile(octokit, owner, repo, filePath, updatedContent, message, branch);
}

/**
 * Creates a new item in a multi-file collection
 */
async function createCollectionItem(
	octokit: Octokit,
	owner: string,
	repo: string,
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

	// Fetch the template file
	const { data: templateData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: templateInfo.resolvedTemplatePath,
		...(options?.branch && { ref: options.branch })
	});

	if (!('content' in templateData)) {
		throw new Error('Expected template file, got directory');
	}

	// Decode the template
	const template = decodeBase64Content(templateData.content);

	// Prepare content based on file type
	let content: string;
	if (templateInfo.isMarkdown) {
		// Parse the template to get default frontmatter and body
		const matter = await import('gray-matter');
		const { data: templateFrontmatter, content: templateBody } = matter.default(template);

		// Merge template frontmatter with new item data
		const { _body, _filename, ...frontmatterData } = newItem;

		// Use provided body or template body
		const body = _body !== undefined ? _body : processTemplate(templateBody, newItem);

		// Merge and process frontmatter
		const mergedFrontmatter = { ...templateFrontmatter, ...frontmatterData };
		const processedFrontmatter: Record<string, any> = {};
		for (const [key, value] of Object.entries(mergedFrontmatter)) {
			processedFrontmatter[key] = typeof value === 'string' ? processTemplate(value, newItem) : value;
		}

		// Serialize to markdown with frontmatter
		content = matter.stringify(body, processedFrontmatter);
	} else {
		// JSON file - process template placeholders
		content = processTemplate(template, newItem);
	}

	// Use provided filename or fallback
	let filename = options?.filename || 'new-item';

	// Ensure file has correct extension
	if (!filename.includes('.')) {
		filename = `${filename}${templateInfo.templateExt}`;
	}

	const filePath = buildCollectionFilePath(templateInfo.templateDir, filename);

	// Generate commit message
	const itemIdentifier = config.idField ? String(newItem[config.idField]) : filename;
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	// Create the file
	await updateFile(octokit, owner, repo, filePath, content, message, options?.branch);
}

/**
 * Deletes an item from a single-file array
 */
async function deleteArrayItem(
	octokit: Octokit,
	owner: string,
	repo: string,
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

	// Resolve path relative to config file location
	const filePath = resolveConfigPath(configPath, config.contentFile);

	// Fetch the current file content
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: filePath,
		...(options.branch && { ref: options.branch })
	});

	if (!('content' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	// Decode and parse the JSON
	const content = decodeBase64Content(fileData.content);
	const jsonData = JSON.parse(content);

	// Find the array using JSONPath
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });
	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	// Find and remove the item
	let itemIdentifier: string | undefined;
	let itemFound = false;
	let removedIndex = -1;

	if (config.idField && options?.itemId !== undefined) {
		// Delete by ID field
		const index = results.findIndex((item) => item[config.idField!] === options.itemId);
		if (index !== -1) {
			itemIdentifier = String(options.itemId);
			results.splice(index, 1);
			removedIndex = index;
			itemFound = true;
		}
	} else if (options?.itemIndex !== undefined) {
		// Delete by index
		if (options.itemIndex >= 0 && options.itemIndex < results.length) {
			const item = results[options.itemIndex];
			itemIdentifier = config.idField
				? String(item[config.idField])
				: `item ${options.itemIndex + 1}`;
			results.splice(options.itemIndex, 1);
			removedIndex = options.itemIndex;
			itemFound = true;
		}
	}

	if (!itemFound) {
		throw new Error('Item not found in array');
	}

	// Update the array in the original JSON structure
	JSONPath({
		path: config.collectionPath,
		json: jsonData,
		callback: () => results,
		wrap: false
	});

	// Serialize back to JSON
	const updatedContent = toJsonFileContent(jsonData);

	// Generate commit message
	const message = generateCommitMessage('delete', config.label, itemIdentifier);

	// Update the file
	await updateFile(octokit, owner, repo, filePath, updatedContent, message, options.branch);
}

/**
 * Deletes an item from a multi-file collection
 */
async function deleteCollectionItem(
	octokit: Octokit,
	owner: string,
	repo: string,
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

	// Get the file SHA (required for deletion)
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: filePath,
		...(options.branch && { ref: options.branch })
	});

	if (!('sha' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	// Generate commit message
	const itemIdentifier = options.itemId || options.filename;
	const message = generateCommitMessage('delete', config.label, itemIdentifier);

	// Delete the file
	await octokit.rest.repos.deleteFile({
		owner,
		repo,
		path: filePath,
		message,
		sha: fileData.sha,
		...(options.branch && { branch: options.branch })
	});
}
