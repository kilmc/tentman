import type { DiscoveredConfig } from '$lib/config/discovery';
import type { ParsedContentConfig } from '$lib/config/parse';
import type { DirectoryContentMode } from '$lib/config/types';
import { resolveConfigPath } from '$lib/utils/validation';

export interface ChangedPathFile {
	filename: string;
	status: string;
	previous_filename?: string;
	previousFilename?: string;
}

export interface ContentFileTarget {
	slug: string;
	configPath: string;
	contentPath: string;
	contentMode: 'file' | 'directory';
	templatePath?: string;
}

export interface DirectoryContentTarget {
	directoryPath: string;
	templatePath: string;
	templateFilename: string;
	templateExtension: string;
	prefix: string;
}

export type DirectoryBackedParsedContentConfig = ParsedContentConfig & {
	content: DirectoryContentMode;
};

export function getChangedFilePaths(file: ChangedPathFile): string[] {
	return [file.filename, file.previous_filename, file.previousFilename].filter(
		(path): path is string => typeof path === 'string' && path.length > 0
	);
}

export function getDirectoryItemIdFromPath(path: string): string | null {
	const filename = path.split('/').pop();
	if (!filename) {
		return null;
	}

	return filename.replace(/\.[^/.]+$/, '');
}

export function getTemplateExtension(templatePath: string): string {
	const filename = templatePath.split('/').pop() ?? templatePath;
	const extensionIndex = filename.lastIndexOf('.');
	return extensionIndex >= 0 ? filename.slice(extensionIndex) : '.md';
}

export function getDirectoryContentTarget(
	config: DirectoryBackedParsedContentConfig,
	configPath: string
): DirectoryContentTarget {
	const directoryPath = resolveConfigPath(configPath, config.content.path);
	const templatePath = resolveConfigPath(configPath, config.content.template);
	const templateFilename = templatePath.split('/').pop() ?? templatePath;

	return {
		directoryPath,
		templatePath,
		templateFilename,
		templateExtension: getTemplateExtension(templatePath),
		prefix: directoryPath ? `${directoryPath}/` : ''
	};
}

export function isRelevantDirectoryContentPath(
	path: string,
	target: DirectoryContentTarget
): boolean {
	if (!path.startsWith(target.prefix)) {
		return false;
	}

	const relativePath = path.slice(target.prefix.length);
	if (relativePath.length === 0 || relativePath.includes('/')) {
		return false;
	}

	if (relativePath.startsWith('_')) {
		return false;
	}

	if (relativePath === target.templateFilename) {
		return false;
	}

	if (relativePath.endsWith('.tentman.json')) {
		return false;
	}

	return relativePath.endsWith(target.templateExtension);
}

export function isRelevantDirectoryContentChange(
	file: ChangedPathFile,
	target: DirectoryContentTarget
): boolean {
	return getChangedFilePaths(file).some((path) => isRelevantDirectoryContentPath(path, target));
}

export function buildContentFileTargets(configs: DiscoveredConfig[]): ContentFileTarget[] {
	return configs.map((config) => ({
		slug: config.slug,
		configPath: config.path,
		contentPath: resolveConfigPath(config.path, config.config.content.path),
		contentMode: config.config.content.mode,
		...(config.config.content.mode === 'directory'
			? {
					templatePath: resolveConfigPath(config.path, config.config.content.template)
				}
			: {})
	}));
}

export function mapPathToConfigSlug(targets: ContentFileTarget[], path: string): string | null {
	for (const target of targets) {
		if (path === target.configPath || path === target.contentPath) {
			return target.slug;
		}

		if (target.contentMode === 'directory') {
			if (target.templatePath && path === target.templatePath) {
				return target.slug;
			}

			if (path.startsWith(`${target.contentPath}/`)) {
				return target.slug;
			}
		}
	}

	return null;
}

export function isConfigContentFileChange(
	config: DiscoveredConfig,
	file: ChangedPathFile
): boolean {
	const contentPath = resolveConfigPath(config.path, config.config.content.path);

	if (config.config.content.mode === 'file') {
		return getChangedFilePaths(file).includes(contentPath);
	}

	const target = getDirectoryContentTarget(
		config.config as DirectoryBackedParsedContentConfig,
		config.path
	);
	return getChangedFilePaths(file).some((path) => isRelevantDirectoryContentPath(path, target));
}
