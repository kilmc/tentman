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
import type { RepositoryBackend } from '$lib/repository/types';

/**
 * Fetches content from GitHub based on config type
 * @param branch - Optional branch name to fetch from (defaults to default branch)
 */
export async function fetchContent(
	backend: RepositoryBackend,
	config: Config,
	configType: ConfigType,
	configPath: string,
	branch?: string
): Promise<ContentDocument> {
	switch (configType) {
		case 'singleton':
			return fetchSingleton(backend, config as SingletonConfig, configPath, branch);
		case 'array':
			return fetchArrayItems(backend, config as SingleFileArrayConfig, configPath, branch);
		case 'collection':
			return fetchCollectionItems(backend, config as MultiFileCollectionConfig, configPath, branch);
	}
}

/**
 * Fetches and parses a single JSON file (singleton pattern)
 */
async function fetchSingleton(
	backend: RepositoryBackend,
	config: SingletonConfig,
	configPath: string,
	branch?: string
): Promise<ContentRecord> {
	try {
		// Resolve path relative to config file location
		const filePath = resolveConfigPath(configPath, config.contentFile);

		return JSON.parse(await backend.readTextFile(filePath, { ref: branch })) as ContentRecord;
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
	backend: RepositoryBackend,
	config: SingleFileArrayConfig,
	configPath: string,
	branch?: string
): Promise<ContentRecord[]> {
	try {
		// Resolve path relative to config file location
		const filePath = resolveConfigPath(configPath, config.contentFile);
		const json = JSON.parse(await backend.readTextFile(filePath, { ref: branch }));

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
	backend: RepositoryBackend,
	config: MultiFileCollectionConfig,
	configPath: string,
	branch?: string
): Promise<ContentRecord[]> {
	try {
		const templateInfo = getTemplateInfo(configPath, config);
		const dirPath = templateInfo.templateDir || '.';

		// Get directory contents
		const directoryEntries = await backend.listDirectory(dirPath || '.', { ref: branch });

		// Filter for content files (exclude template and private files)
		const contentFiles = directoryEntries.filter((file) => {
			if (file.kind !== 'file') return false;
			if (file.name.startsWith('_')) return false;
			if (file.name === templateInfo.templateFilename) return false;
			if (file.name.endsWith('.tentman.json')) return false;

			return file.name.endsWith(templateInfo.templateExt);
		});

		// Fetch and parse each file
		const items = await Promise.all(
			contentFiles.map(async (file) => {
				try {
					return parseCollectionItem(
						await backend.readTextFile(file.path, { ref: branch }),
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
