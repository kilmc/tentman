import { findBlockById, getBlockLabel } from '$lib/config/blocks';
import type { ParsedContentConfig } from '$lib/config/parse';
import type { BlockRegistry } from '$lib/blocks/registry';
import { DEFAULT_BLOCK_REGISTRY, resolveBlockAdapterForUsage } from '$lib/blocks/registry';
import { toBlockAdapterUsageFromBlock } from '$lib/blocks/compat';
import { getBlockStorageKey } from '$lib/config/tentman-group';
import type { ContentRecord } from '$lib/features/content-management/types';

export interface ValidationError {
	field: string;
	message: string;
}

export function validateFormData(
	config: ParsedContentConfig,
	data: ContentRecord,
	options?: {
		existingItems?: ContentRecord[];
		currentItemId?: string;
	},
	registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY
): ValidationError[] {
	const errors: ValidationError[] = [];

	for (const block of config.blocks) {
		const storageKey = getBlockStorageKey(block);
		const value = data[storageKey];
		const adapter = resolveBlockAdapterForUsage(block, registry);

		if (!adapter && block.collection) {
			if (!Array.isArray(value)) {
				errors.push({
					field: storageKey,
					message: `${getBlockLabel(block)} must be an array`
				});
			}
			continue;
		}

		if (!adapter?.validate) {
			continue;
		}

		const fieldErrors = adapter.validate(value, toBlockAdapterUsageFromBlock(block));
		errors.push(...fieldErrors.map((message) => ({ field: storageKey, message })));
	}

	// Validate uniqueness for ID field (if configured)
	if (config.idField && options?.existingItems) {
		const idField = config.idField; // Extract to ensure type safety
		const idValue = data[idField];
		if (idValue) {
			const isDuplicate = options.existingItems.some((item) => {
				// Skip checking against the current item (when editing)
				if (options.currentItemId && item[idField] === options.currentItemId) {
					return false;
				}
				return item[idField] === idValue;
			});

			if (isDuplicate) {
				const idBlock = findBlockById(config.blocks, config.idField) ?? { id: config.idField };

				errors.push({
					field: config.idField,
					message: `${getBlockLabel(idBlock)} must be unique. This value is already in use.`
				});
			}
		}
	}

	return errors;
}

/**
 * Normalizes a file path for use with GitHub API
 * Removes leading ./ or . from paths
 */
export function normalizeGitHubPath(path: string): string {
	// Remove leading ./
	if (path.startsWith('./')) {
		return path.slice(2);
	}
	// Remove leading . if it's the entire path
	if (path === '.') {
		return '';
	}
	return path;
}

/**
 * Resolves a relative path based on the config file's location
 * This ensures that paths like "./template.md" are resolved relative to the config file
 *
 * @param configPath - Full path to the config file (e.g., "src/lib/db/posts.tentman.json")
 * @param relativePath - Path to resolve (e.g., "./post.template.md" or "content/file.json")
 * @returns Resolved path ready for GitHub API
 *
 * @example
 * resolveConfigPath("src/lib/db/posts.tentman.json", "./template.md")
 * // Returns: "src/lib/db/template.md"
 *
 * resolveConfigPath("content/blog.tentman.json", "./posts/post.md")
 * // Returns: "content/posts/post.md"
 *
 * resolveConfigPath("posts.tentman.json", "./template.md")
 * // Returns: "template.md"
 */
export function resolveConfigPath(configPath: string, relativePath: string): string {
	// Get directory from config path (everything before the last /)
	const lastSlashIndex = configPath.lastIndexOf('/');
	const configDir = lastSlashIndex >= 0 ? configPath.substring(0, lastSlashIndex) : '';

	if (relativePath === '.') {
		return configDir;
	}

	// Handle relative paths starting with ./
	if (relativePath.startsWith('./')) {
		const pathWithoutDot = relativePath.slice(2);
		if (!pathWithoutDot) {
			return configDir;
		}
		return configDir ? `${configDir}/${pathWithoutDot}` : pathWithoutDot;
	}

	// Handle relative paths starting with ../
	if (relativePath.startsWith('../')) {
		return resolveRelativePath(configDir, relativePath);
	}

	// Already absolute or root-relative - just normalize
	return normalizeGitHubPath(relativePath);
}

/**
 * Resolves ../ paths by going up directories
 * @private
 */
function resolveRelativePath(basePath: string, relativePath: string): string {
	const parts = basePath.split('/').filter((p) => p.length > 0);
	const relativeParts = relativePath.split('/');

	for (const part of relativeParts) {
		if (part === '..') {
			// Go up one directory
			if (parts.length > 0) {
				parts.pop();
			}
		} else if (part === '.') {
			// Current directory - skip
			continue;
		} else if (part.length > 0) {
			// Regular path component
			parts.push(part);
		}
	}

	return parts.join('/');
}
