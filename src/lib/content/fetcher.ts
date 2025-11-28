import type { Octokit } from 'octokit';
import { JSONPath } from 'jsonpath-plus';
import matter from 'gray-matter';
import type {
	Config,
	SingletonConfig,
	SingleFileArrayConfig,
	MultiFileCollectionConfig,
	ConfigType
} from '$lib/types/config';

/**
 * Fetches content from GitHub based on config type
 */
export async function fetchContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: Config,
	configType: ConfigType,
	configPath: string
): Promise<any> {
	switch (configType) {
		case 'singleton':
			return fetchSingleton(octokit, owner, repo, config as SingletonConfig);
		case 'array':
			return fetchArrayItems(octokit, owner, repo, config as SingleFileArrayConfig);
		case 'collection':
			return fetchCollectionItems(octokit, owner, repo, config as MultiFileCollectionConfig, configPath);
	}
}

/**
 * Fetches and parses a single JSON file (singleton pattern)
 */
async function fetchSingleton(
	octokit: Octokit,
	owner: string,
	repo: string,
	config: SingletonConfig
): Promise<any> {
	try {
		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: config.contentFile
		});

		if (Array.isArray(response.data) || response.data.type !== 'file') {
			throw new Error(`Expected file at ${config.contentFile}, got directory or multiple files`);
		}

		const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
		return JSON.parse(content);
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
	config: SingleFileArrayConfig
): Promise<any[]> {
	try {
		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: config.contentFile
		});

		if (Array.isArray(response.data) || response.data.type !== 'file') {
			throw new Error(`Expected file at ${config.contentFile}, got directory or multiple files`);
		}

		const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
		const json = JSON.parse(content);

		// Use JSONPath to extract the array from the JSON structure
		const items = JSONPath({ path: config.collectionPath, json });

		if (!Array.isArray(items) || items.length === 0) {
			return [];
		}

		// If JSONPath returns an array of arrays, flatten it
		return Array.isArray(items[0]) ? items.flat() : items;
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
	configPath: string
): Promise<any[]> {
	try {
		// Determine the directory path from the config file's location
		// The config lives in the same directory as the content files
		const dirPath = configPath.substring(0, configPath.lastIndexOf('/'));

		// Get directory contents
		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: dirPath || '.'
		});

		if (!Array.isArray(response.data)) {
			throw new Error(`Expected directory at ${dirPath}, got single file`);
		}

		// Determine file extension from template
		const templateExt = config.template.substring(config.template.lastIndexOf('.'));
		const isMarkdown = templateExt === '.md' || templateExt === '.markdown';

		// Filter for content files (exclude template and private files)
		const contentFiles = response.data.filter((file) => {
			if (file.type !== 'file') return false;
			if (file.name.startsWith('_')) return false; // Skip private files
			if (file.name === config.template.split('/').pop()) return false; // Skip template
			if (file.name.endsWith('.tentman.json')) return false; // Skip config files

			// Check extension matches template
			return file.name.endsWith(templateExt);
		});

		// Fetch and parse each file
		const items = await Promise.all(
			contentFiles.map(async (file) => {
				try {
					const fileResponse = await octokit.rest.repos.getContent({
						owner,
						repo,
						path: file.path
					});

					if (Array.isArray(fileResponse.data) || fileResponse.data.type !== 'file') {
						return null;
					}

					const content = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');

					if (isMarkdown) {
						// Parse markdown frontmatter
						const { data, content: body } = matter(content);
						return {
							...data,
							_body: body, // Store markdown body
							_filename: file.name
						};
					} else {
						// Parse JSON
						const data = JSON.parse(content);
						return {
							...data,
							_filename: file.name
						};
					}
				} catch (error) {
					console.error(`Failed to fetch file ${file.path}:`, error);
					return null;
				}
			})
		);

		// Filter out failed fetches
		return items.filter((item): item is any => item !== null);
	} catch (error) {
		throw new Error(
			`Failed to fetch collection items from ${config.template}: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
