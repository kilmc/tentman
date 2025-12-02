import type { Config, FieldDefinition } from '$lib/types/config';
import { normalizeFields } from '$lib/types/config';

export interface ValidationError {
	field: string;
	message: string;
}

export function validateFormData(
	config: Config,
	data: Record<string, any>,
	options?: {
		existingItems?: any[];
		currentItemId?: string;
	}
): ValidationError[] {
	const errors: ValidationError[] = [];

	// Normalize fields to handle both array and object formats
	const normalizedFields = normalizeFields(config.fields);

	for (const [fieldName, fieldDef] of Object.entries(normalizedFields)) {
		const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;
		const required = typeof fieldDef === 'object' ? fieldDef.required ?? false : false;
		const value = data[fieldName];

		// Check required fields
		if (required && (value === undefined || value === null || value === '')) {
			errors.push({
				field: fieldName,
				message: `${getFieldLabel(fieldName)} is required`
			});
			continue;
		}

		// Skip validation if field is empty and not required
		if (value === undefined || value === null || value === '') {
			continue;
		}

		// Type-specific validation
		switch (fieldType) {
			case 'email':
				if (!isValidEmail(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid email address`
					});
				}
				break;

			case 'url':
				if (!isValidUrl(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid URL`
					});
				}
				break;

			case 'number':
				if (typeof value !== 'number' || isNaN(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid number`
					});
				}
				break;

			case 'date':
				if (!isValidDate(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid date`
					});
				}
				break;

			case 'array':
				if (!Array.isArray(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be an array`
					});
				}
				break;
		}
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
				errors.push({
					field: config.idField,
					message: `${getFieldLabel(config.idField)} must be unique. This value is already in use.`
				});
			}
		}
	}

	return errors;
}

function getFieldLabel(fieldName: string): string {
	return fieldName
		.replace(/([A-Z])/g, ' $1')
		.replace(/_/g, ' ')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function isValidDate(date: string): boolean {
	const parsedDate = new Date(date);
	return !isNaN(parsedDate.getTime());
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

	// Handle relative paths starting with ./
	if (relativePath.startsWith('./')) {
		const pathWithoutDot = relativePath.slice(2);
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
	const parts = basePath.split('/').filter(p => p.length > 0);
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
