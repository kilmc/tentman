import type { Octokit } from 'octokit';
import { JSONPath } from 'jsonpath-plus';
import matter from 'gray-matter';
import { updateFile, generateCommitMessage } from '$lib/github/commit';
import type { Config } from '$lib/types/config';

/**
 * Saves content back to the repository based on config type
 */
export async function saveContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	data: Record<string, any>,
	options?: {
		itemIndex?: number; // For array updates
		itemId?: string; // For array updates using idField
		filename?: string; // For collection updates
		newFilename?: string; // For renaming collection items
	}
): Promise<void> {
	if (configType === 'singleton') {
		await saveSingleton(octokit, owner, repo, config, data);
	} else if (configType === 'array') {
		await saveArrayItem(octokit, owner, repo, config, data, options);
	} else if (configType === 'collection') {
		await saveCollectionItem(octokit, owner, repo, config, data, options);
	}
}

/**
 * Creates a new item in an array or collection
 */
export async function createContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	data: Record<string, any>
): Promise<void> {
	if (configType === 'array') {
		await createArrayItem(octokit, owner, repo, config, data);
	} else if (configType === 'collection') {
		await createCollectionItem(octokit, owner, repo, config, data);
	} else {
		throw new Error('Cannot create items for singleton configs');
	}
}

/**
 * Deletes an item from an array or collection
 */
export async function deleteContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: 'singleton' | 'array' | 'collection',
	options: {
		itemIndex?: number;
		itemId?: string;
		filename?: string;
	}
): Promise<void> {
	if (configType === 'array') {
		await deleteArrayItem(octokit, owner, repo, config, options);
	} else if (configType === 'collection') {
		await deleteCollectionItem(octokit, owner, repo, config, options);
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
	data: Record<string, any>
): Promise<void> {
	if (!('contentFile' in config)) {
		throw new Error('Singleton config must have contentFile');
	}

	// Serialize data to JSON with nice formatting
	const content = JSON.stringify(data, null, 2) + '\n';

	// Generate commit message
	const message = generateCommitMessage('update', config.label);

	// Update the file
	await updateFile(octokit, owner, repo, config.contentFile, content, message);
}

/**
 * Saves an item in a single-file array
 */
async function saveArrayItem(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	updatedItem: Record<string, any>,
	options?: {
		itemIndex?: number;
		itemId?: string;
	}
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	// Fetch the current file content
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: config.contentFile
	});

	if (!('content' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	// Decode and parse the JSON
	const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
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
	await updateFile(octokit, owner, repo, config.contentFile, updatedContent, message);
}

/**
 * Saves an item in a multi-file collection (markdown or JSON)
 */
async function saveCollectionItem(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	updatedItem: Record<string, any>,
	options?: {
		filename?: string;
		newFilename?: string;
	}
): Promise<void> {
	if (!options?.filename) {
		throw new Error('Filename is required to save collection item');
	}

	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	// Determine the directory path from the template
	const templateDir = config.template.substring(0, config.template.lastIndexOf('/'));
	const oldFilePath = `${templateDir}/${options.filename}`;

	// Determine file type from template extension
	const templateExt = config.template.substring(config.template.lastIndexOf('.'));
	const isMarkdown = templateExt === '.md' || templateExt === '.markdown';

	// Prepare content based on file type
	let content: string;
	if (isMarkdown) {
		// Separate _body from other fields for frontmatter
		const { _body, _filename, ...frontmatterData } = updatedItem;

		// Serialize to markdown with frontmatter
		content = matter.stringify(_body || '', frontmatterData);
	} else {
		// JSON file - serialize without metadata fields
		const { _filename, ...jsonData } = updatedItem;
		content = JSON.stringify(jsonData, null, 2) + '\n';
	}

	// Generate commit message
	const itemIdentifier = config.idField ? String(updatedItem[config.idField]) : options.filename;

	// Handle filename change (rename)
	if (options.newFilename && options.newFilename !== options.filename) {
		const newFilePath = `${templateDir}/${options.newFilename}`;

		// Get the old file SHA (required for deletion)
		const { data: oldFileData } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: oldFilePath
		});

		if (!('sha' in oldFileData)) {
			throw new Error('Expected file, got directory');
		}

		// Create new file with updated content
		const createMessage = generateCommitMessage('rename', config.label, `${options.filename} → ${options.newFilename}`);
		await updateFile(octokit, owner, repo, newFilePath, content, createMessage);

		// Delete old file
		await octokit.rest.repos.deleteFile({
			owner,
			repo,
			path: oldFilePath,
			message: createMessage,
			sha: oldFileData.sha
		});
	} else {
		// Normal update (no rename)
		const message = generateCommitMessage('update', config.label, itemIdentifier);
		await updateFile(octokit, owner, repo, oldFilePath, content, message);
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
	newItem: Record<string, any>
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	// Fetch the current file content
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: config.contentFile
	});

	if (!('content' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	// Decode and parse the JSON
	const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
	const jsonData = JSON.parse(content);

	// Find the array using JSONPath
	const results = JSONPath({ path: config.collectionPath, json: jsonData, wrap: false });
	if (!Array.isArray(results)) {
		throw new Error('CollectionPath did not resolve to an array');
	}

	// Generate ID if configured
	if (config.idField) {
		const fieldDef = config.fields[config.idField];
		if (typeof fieldDef === 'object' && fieldDef.generated) {
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
	const updatedContent = JSON.stringify(jsonData, null, 2) + '\n';

	// Generate commit message
	const itemIdentifier = config.idField ? String(newItem[config.idField]) : 'new item';
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	// Update the file
	await updateFile(octokit, owner, repo, config.contentFile, updatedContent, message);
}

/**
 * Creates a new item in a multi-file collection
 */
async function createCollectionItem(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	newItem: Record<string, any>
): Promise<void> {
	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	// Fetch the template file
	const { data: templateData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: config.template
	});

	if (!('content' in templateData)) {
		throw new Error('Expected template file, got directory');
	}

	// Decode the template
	let template = Buffer.from(templateData.content, 'base64').toString('utf-8');

	// Determine file type from template extension
	const templateExt = config.template.substring(config.template.lastIndexOf('.'));
	const isMarkdown = templateExt === '.md' || templateExt === '.markdown';

	// Prepare content based on file type
	let content: string;
	if (isMarkdown) {
		// Parse the template to get default frontmatter and body
		const { data: templateFrontmatter, content: templateBody } = matter(template);

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

	// Generate filename from pattern
	let filename = config.filename || 'new-item';
	filename = processTemplate(filename, newItem);

	// Ensure file has correct extension
	if (!filename.includes('.')) {
		filename = `${filename}${templateExt}`;
	}

	// For collections, we need to determine the collection path
	// Collections use a directory structure, so we'll use the template's directory
	const templateDir = config.template.substring(0, config.template.lastIndexOf('/'));
	const filePath = `${templateDir}/${filename}`;

	// Generate commit message
	const itemIdentifier = config.idField ? String(newItem[config.idField]) : filename;
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	// Create the file
	await updateFile(octokit, owner, repo, filePath, content, message);
}

/**
 * Deletes an item from a single-file array
 */
async function deleteArrayItem(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	options: {
		itemIndex?: number;
		itemId?: string;
	}
): Promise<void> {
	if (!('contentFile' in config) || !('collectionPath' in config)) {
		throw new Error('Array config must have contentFile and collectionPath');
	}

	// Fetch the current file content
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: config.contentFile
	});

	if (!('content' in fileData)) {
		throw new Error('Expected file, got directory');
	}

	// Decode and parse the JSON
	const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
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
	const updatedContent = JSON.stringify(jsonData, null, 2) + '\n';

	// Generate commit message
	const message = generateCommitMessage('delete', config.label, itemIdentifier);

	// Update the file
	await updateFile(octokit, owner, repo, config.contentFile, updatedContent, message);
}

/**
 * Deletes an item from a multi-file collection
 */
async function deleteCollectionItem(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	options: {
		filename?: string;
		itemId?: string;
	}
): Promise<void> {
	if (!options.filename) {
		throw new Error('Filename is required to delete collection item');
	}

	if (!('template' in config)) {
		throw new Error('Collection config must have template');
	}

	// For collections, construct the file path using the template's directory
	const templateDir = config.template.substring(0, config.template.lastIndexOf('/'));
	const filePath = `${templateDir}/${options.filename}`;

	// Get the file SHA (required for deletion)
	const { data: fileData } = await octokit.rest.repos.getContent({
		owner,
		repo,
		path: filePath
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
		sha: fileData.sha
	});
}

/**
 * Process template string by replacing {{placeholder}} with values from data
 */
function processTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return data[key] !== undefined ? String(data[key]) : match;
	});
}
