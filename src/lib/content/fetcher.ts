import type { Octokit } from 'octokit';
import { JSONPath } from 'jsonpath-plus';
import type {
	Config,
	SingletonConfig,
	SingleFileArrayConfig,
	MultiFileCollectionConfig,
	ConfigType
} from '$lib/types/config';
import { resolveConfigPath } from '$lib/utils/validation';
import { decodeBase64Content, getTemplateInfo, parseCollectionItem } from '$lib/features/content-management/transforms';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';

/**
 * Fetches content from GitHub based on config type
 * @param branch - Optional branch name to fetch from (defaults to default branch)
 */
export async function fetchContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: ConfigType,
	configPath: string,
	branch?: string
): Promise<ContentDocument> {
	switch (configType) {
		case 'singleton':
			return fetchSingleton(octokit, owner, repo, config as SingletonConfig, configPath, branch);
		case 'array':
			return fetchArrayItems(octokit, owner, repo, config as SingleFileArrayConfig, configPath, branch);
		case 'collection':
			return fetchCollectionItems(octokit, owner, repo, config as MultiFileCollectionConfig, configPath, branch);
	}
}

/**
 * Fetches and parses a single JSON file (singleton pattern)
 */
async function fetchSingleton(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: SingletonConfig,
	configPath: string,
	branch?: string
): Promise<ContentRecord> {
	try {
		// Resolve path relative to config file location
		const filePath = resolveConfigPath(configPath, config.contentFile);

		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: filePath,
			...(branch && { ref: branch })
		});

		if (Array.isArray(response.data) || response.data.type !== 'file') {
			throw new Error(`Expected file at ${config.contentFile}, got directory or multiple files`);
		}

			return JSON.parse(decodeBase64Content(response.data.content)) as ContentRecord;
	} catch (error) {
		throw new Error(
			`Failed to fetch singleton content from ${config.contentFile}: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Fetches a JSON file and extracts array items using JSONPath
 */
async function fetchArrayItems(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: SingleFileArrayConfig,
	configPath: string,
	branch?: string
): Promise<ContentRecord[]> {
	try {
		// Resolve path relative to config file location
		const filePath = resolveConfigPath(configPath, config.contentFile);

		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: filePath,
			...(branch && { ref: branch })
		});

		if (Array.isArray(response.data) || response.data.type !== 'file') {
			throw new Error(`Expected file at ${config.contentFile}, got directory or multiple files`);
		}

			const json = JSON.parse(decodeBase64Content(response.data.content));

		// Use JSONPath to extract the array from the JSON structure
		const items = JSONPath({ path: config.collectionPath, json });

		if (!Array.isArray(items) || items.length === 0) {
			return [];
		}

		// If JSONPath returns an array of arrays, flatten it
			const records = Array.isArray(items[0]) ? items.flat() : items;
			return records as ContentRecord[];
	} catch (error) {
		throw new Error(
			`Failed to fetch array items from ${config.contentFile}: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Fetches multiple files from a directory (collection pattern)
 * Supports both markdown and JSON files
 */
async function fetchCollectionItems(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: MultiFileCollectionConfig,
	configPath: string,
	branch?: string
): Promise<ContentRecord[]> {
	try {
		const templateInfo = getTemplateInfo(configPath, config);
		const dirPath = templateInfo.templateDir || '.';

		// Get directory contents
		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: dirPath || '.',
			...(branch && { ref: branch })
		});

		if (!Array.isArray(response.data)) {
			throw new Error(`Expected directory at ${dirPath}, got single file`);
		}

		// Filter for content files (exclude template and private files)
		const contentFiles = response.data.filter((file) => {
			if (file.type !== 'file') return false;
			if (file.name.startsWith('_')) return false; // Skip private files
			if (file.name === templateInfo.templateFilename) return false; // Skip template
			if (file.name.endsWith('.tentman.json')) return false; // Skip config files

			// Check extension matches template
			return file.name.endsWith(templateInfo.templateExt);
		});

		// Fetch and parse each file
		const items = await Promise.all(
			contentFiles.map(async (file) => {
				try {
					const fileResponse = await octokit.rest.repos.getContent({
						owner,
						repo,
						path: file.path,
						...(branch && { ref: branch })
					});

					if (Array.isArray(fileResponse.data) || fileResponse.data.type !== 'file') {
						return null;
					}

						return parseCollectionItem(
							decodeBase64Content(fileResponse.data.content),
							templateInfo.isMarkdown,
							file.name
						);
					} catch (error) {
						console.error(`Failed to fetch file ${file.path}:`, error);
						return null;
				}
			})
		);

		// Filter out failed fetches
			return items.filter((item): item is ContentRecord => item !== null);
	} catch (error) {
		throw new Error(
			`Failed to fetch collection items from ${config.template}: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
