import matter from 'gray-matter';
import type { ParsedContentConfig } from '$lib/config/parse';
import { generateCommitMessage } from '$lib/github/commit';
import {
	buildCollectionFilePath,
	getCollectionFilenameBase,
	parseCollectionItem,
	processTemplate,
	serializeCollectionItem
} from '$lib/features/content-management/transforms';
import { getItemSlug } from '$lib/features/content-management/item';
import {
	ensureTentmanItemId,
	normalizeRuntimeCollectionItemIds
} from '$lib/features/content-management/stable-identity';
import { ensureBufferGlobal, getUtf8ByteLength } from '$lib/utils/text';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import { resolveConfigPath } from '$lib/utils/validation';
import type {
	ContentAdapter,
	ChangesSummary,
	ContentCreateOptions,
	ContentDeleteOptions,
	ContentFetchOptions,
	ContentOperationContext,
	ContentPreviewOptions,
	ContentSaveOptions
} from './types';

type DirectoryBackedConfig = ParsedContentConfig & {
	content: {
		mode: 'directory';
		path: string;
		template: string;
		filename?: string;
	};
};

interface DirectoryInfo {
	resolvedDirectoryPath: string;
	resolvedTemplatePath: string;
	templateExt: string;
	templateFilename: string;
	isMarkdown: boolean;
}

function getDirectoryInfo(context: ContentOperationContext): DirectoryInfo {
	const config = asDirectoryBackedConfig(context);
	const resolvedDirectoryPath = resolveConfigPath(context.configPath, config.content.path);
	const resolvedTemplatePath = resolveConfigPath(context.configPath, config.content.template);
	const templateFilename = resolvedTemplatePath.split('/').pop() ?? resolvedTemplatePath;
	const templateExt =
		config.content.template.substring(config.content.template.lastIndexOf('.')) || '.md';

	return {
		resolvedDirectoryPath,
		resolvedTemplatePath,
		templateExt,
		templateFilename,
		isMarkdown: templateExt === '.md' || templateExt === '.markdown'
	};
}

function asDirectoryBackedConfig(context: ContentOperationContext): DirectoryBackedConfig {
	if (context.config.content.mode !== 'directory') {
		throw new Error(`Expected directory-backed content, received ${context.config.content.mode}`);
	}

	return context.config as DirectoryBackedConfig;
}

function getWriteOptions(branch: string | undefined, message: string) {
	return { ref: branch, message };
}

function ensureFilename(filename: string, templateExt: string): string {
	return filename.includes('.') ? filename : `${filename}${templateExt}`;
}

async function buildCreatedContent(
	context: ContentOperationContext,
	data: ContentRecord,
	info: DirectoryInfo,
	branch?: string
): Promise<string> {
	const template = await context.backend.readTextFile(info.resolvedTemplatePath, { ref: branch });

	if (!info.isMarkdown) {
		return processTemplate(template, data);
	}

	ensureBufferGlobal();
	const { data: templateFrontmatter, content: templateBody } = matter(template);
	const { body, ...frontmatterData } = data;
	delete frontmatterData._filename;
	const bodyContent = typeof body === 'string' ? body : processTemplate(templateBody, data);
	const mergedFrontmatter = { ...templateFrontmatter, ...frontmatterData };
	const processedFrontmatter: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(mergedFrontmatter)) {
		processedFrontmatter[key] = typeof value === 'string' ? processTemplate(value, data) : value;
	}

	return matter.stringify(bodyContent, processedFrontmatter);
}

async function previewDirectoryContent(
	context: ContentOperationContext,
	data: ContentRecord,
	options?: ContentPreviewOptions
): Promise<ChangesSummary> {
	const info = getDirectoryInfo(context);

	if (options?.isNew) {
		const nextData = ensureTentmanItemId(asDirectoryBackedConfig(context), data);
		const filename = ensureFilename(
			options.newFilename || getCollectionFilenameBase(asDirectoryBackedConfig(context), nextData),
			info.templateExt
		);
		const filePath = buildCollectionFilePath(info.resolvedDirectoryPath, filename);
		const newContent = await buildCreatedContent(context, nextData, info, options?.branch);

		return {
			files: [
				{
					path: filePath,
					type: 'create',
					newContent,
					size: getUtf8ByteLength(newContent)
				}
			],
			totalChanges: 1
		};
	}

	if (!options?.filename) {
		throw new Error('filename is required to preview directory-backed updates');
	}

	const oldFilePath = buildCollectionFilePath(info.resolvedDirectoryPath, options.filename);
	const oldContent = await context.backend.readTextFile(oldFilePath, { ref: options.branch });
	const nextData = ensureTentmanItemId(asDirectoryBackedConfig(context), data);
	const newContent = serializeCollectionItem(nextData, info.isMarkdown);

	if (options.newFilename && options.newFilename !== options.filename) {
		const newFilename = ensureFilename(options.newFilename, info.templateExt);
		const newFilePath = buildCollectionFilePath(info.resolvedDirectoryPath, newFilename);

		return {
			files: [
				{
					path: newFilePath,
					type: 'create',
					newContent,
					size: getUtf8ByteLength(newContent)
				},
				{
					path: oldFilePath,
					type: 'delete',
					oldContent,
					size: getUtf8ByteLength(oldContent)
				}
			],
			totalChanges: 2
		};
	}

	return {
		files: [
			{
				path: oldFilePath,
				type: 'update',
				oldContent,
				newContent,
				size: getUtf8ByteLength(newContent)
			}
		],
		totalChanges: 1
	};
}

async function fetchDirectoryContent(
	context: ContentOperationContext,
	options?: ContentFetchOptions
): Promise<ContentDocument> {
	const info = getDirectoryInfo(context);
	const directoryEntries = await context.backend.listDirectory(info.resolvedDirectoryPath || '.', {
		ref: options?.branch
	});

	const contentFiles = directoryEntries.filter((entry) => {
		if (entry.kind !== 'file') return false;
		if (entry.name.startsWith('_')) return false;
		if (entry.name === info.templateFilename) return false;
		if (entry.name.endsWith('.tentman.json')) return false;

		return entry.name.endsWith(info.templateExt);
	});

	const items = await Promise.all(
		contentFiles.map(async (entry) => {
			try {
				return parseCollectionItem(
					await context.backend.readTextFile(entry.path, { ref: options?.branch }),
					info.isMarkdown,
					entry.name
				);
			} catch (error) {
				console.error(`Failed to fetch file ${entry.path}:`, error);
				return null;
			}
		})
	);

	return normalizeRuntimeCollectionItemIds(
		context.config,
		items.filter((item): item is ContentRecord => item !== null)
	);
}

async function saveDirectoryContent(
	context: ContentOperationContext,
	data: ContentRecord,
	options?: ContentSaveOptions
): Promise<void> {
	if (!options?.filename) {
		throw new Error('Filename is required to save directory-backed content');
	}

	const info = getDirectoryInfo(context);
	const oldFilePath = buildCollectionFilePath(info.resolvedDirectoryPath, options.filename);
	const nextData = ensureTentmanItemId(asDirectoryBackedConfig(context), data);
	const content = serializeCollectionItem(nextData, info.isMarkdown);
	const config = asDirectoryBackedConfig(context);
	const itemIdentifier = getItemSlug(config, nextData) ?? options.filename;

	if (options.newFilename && options.newFilename !== options.filename) {
		const newFilename = ensureFilename(options.newFilename, info.templateExt);
		const newFilePath = buildCollectionFilePath(info.resolvedDirectoryPath, newFilename);
		const message = generateCommitMessage(
			'rename',
			config.label,
			`${options.filename} → ${newFilename}`
		);

		await context.backend.writeTextFile(
			newFilePath,
			content,
			getWriteOptions(options.branch, message)
		);
		await context.backend.deleteFile(oldFilePath, getWriteOptions(options.branch, message));
		return;
	}

	const message = generateCommitMessage('update', config.label, itemIdentifier);
	await context.backend.writeTextFile(
		oldFilePath,
		content,
		getWriteOptions(options?.branch, message)
	);
}

async function createDirectoryContent(
	context: ContentOperationContext,
	data: ContentRecord,
	options?: ContentCreateOptions
): Promise<void> {
	const info = getDirectoryInfo(context);
	const config = asDirectoryBackedConfig(context);
	const nextData = ensureTentmanItemId(config, data);
	const content = await buildCreatedContent(context, nextData, info, options?.branch);
	const filename = ensureFilename(
		options?.filename || getCollectionFilenameBase(config, nextData),
		info.templateExt
	);
	const filePath = buildCollectionFilePath(info.resolvedDirectoryPath, filename);
	const itemIdentifier = getItemSlug(config, nextData) ?? filename;
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	await context.backend.writeTextFile(filePath, content, getWriteOptions(options?.branch, message));
}

async function deleteDirectoryContent(
	context: ContentOperationContext,
	options: ContentDeleteOptions
): Promise<void> {
	if (!options.filename) {
		throw new Error('Filename is required to delete directory-backed content');
	}

	const info = getDirectoryInfo(context);
	const filePath = buildCollectionFilePath(info.resolvedDirectoryPath, options.filename);
	const itemIdentifier = options.itemId || options.filename;
	const message = generateCommitMessage(
		'delete',
		asDirectoryBackedConfig(context).label,
		itemIdentifier
	);

	await context.backend.deleteFile(filePath, getWriteOptions(options.branch, message));
}

export const directoryContentAdapter: ContentAdapter = {
	mode: 'directory',
	fetch: fetchDirectoryContent,
	save: saveDirectoryContent,
	create: createDirectoryContent,
	delete: deleteDirectoryContent,
	preview: previewDirectoryContent
};
