import path from 'node:path';
import { collectContentComponentReferenceIndex } from './content-components.js';
import { isMarkdownContentPath } from './content-files.js';
import { getPathRelativeToRoot, resolveConfigRelativePath } from './paths.js';

function createReusableBlocksById(project) {
	return new Map(
		project.blocks
			.filter((block) => !block.error && typeof block.id === 'string')
			.map((block) => [block.id, block])
	);
}

export function createTentmanStructuredBlockResolver(project) {
	const reusableBlocksById = createReusableBlocksById(project);

	return function resolveStructuredBlocks(block) {
		if (Array.isArray(block?.blocks)) {
			return block.blocks;
		}

		if (typeof block?.type !== 'string') {
			return null;
		}

		return reusableBlocksById.get(block.type)?.raw?.blocks ?? null;
	};
}

function isPathWithinDirectory(directoryPath, absoluteFilePath) {
	const relativePath = path.relative(directoryPath, absoluteFilePath);
	return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function findManagedMarkdownConfig(project, absoluteFilePath) {
	for (const config of project.configs) {
		const resolvedContentPath = resolveConfigRelativePath(project.rootDir, config.path, config.content.path);

		if (config.content.mode === 'file') {
			if (
				isMarkdownContentPath(resolvedContentPath) &&
				path.resolve(resolvedContentPath) === absoluteFilePath
			) {
				return {
					config,
					contentPath: resolvedContentPath
				};
			}

			continue;
		}

		if (!isMarkdownContentPath(absoluteFilePath)) {
			continue;
		}

		if (isPathWithinDirectory(resolvedContentPath, absoluteFilePath)) {
			return {
				config,
				contentPath: resolvedContentPath
			};
		}
	}

	return null;
}

function resolveManagedContentItem(project, config, absoluteFilePath) {
	const content = project.contentByConfigPath.get(config.path);
	const itemLabel = getPathRelativeToRoot(project.rootDir, absoluteFilePath);

	if (config.content.mode === 'file') {
		const contentItem = content?.items?.[0];
		if (!contentItem || typeof contentItem !== 'object' || Array.isArray(contentItem)) {
			throw new Error(`Tentman-managed markdown file could not be resolved to a content item: ${itemLabel}`);
		}

		return contentItem;
	}

	const sourcePath = getPathRelativeToRoot(project.rootDir, absoluteFilePath);
	const contentItem = content?.items?.find((item) => item?.__tentmanSourcePath === sourcePath);

	if (!contentItem || typeof contentItem !== 'object' || Array.isArray(contentItem)) {
		throw new Error(`Tentman-managed markdown file could not be resolved to a content item: ${itemLabel}`);
	}

	return contentItem;
}

export function resolveTentmanMarkdownFileRenderContext(project, absoluteFilePath) {
	const normalizedFilePath = path.resolve(absoluteFilePath);

	if (!isMarkdownContentPath(normalizedFilePath)) {
		return null;
	}

	const managedConfig = findManagedMarkdownConfig(project, normalizedFilePath);
	if (!managedConfig) {
		return null;
	}

	const { config } = managedConfig;
	const blocks = config.raw.blocks;
	const contentItem = resolveManagedContentItem(project, config, normalizedFilePath);
	const resolveStructuredBlocks = createTentmanStructuredBlockResolver(project);
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks,
		contentItem,
		resolveStructuredBlocks
	});

	if (errors.length > 0) {
		throw new Error(
			`Failed to build Tentman markdown render context for ${getPathRelativeToRoot(project.rootDir, normalizedFilePath)}: ${errors.join('; ')}`
		);
	}

	return {
		config,
		contentItem,
		blocks,
		referenceIndex,
		resolveStructuredBlocks
	};
}
