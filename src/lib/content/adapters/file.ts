import { JSONPath } from 'jsonpath-plus';
import { findBlockById } from '$lib/config/blocks';
import type { ParsedContentConfig } from '$lib/config/parse';
import { generateCommitMessage } from '$lib/github/commit';
import { getItemId, getItemRoute, getItemSlug } from '$lib/features/content-management/item';
import {
	ensureTentmanItemId,
	normalizeRuntimeCollectionItemIds
} from '$lib/features/content-management/stable-identity';
import { detectJsonIndent, toJsonFileContent } from '$lib/features/content-management/transforms';
import { getUtf8ByteLength } from '$lib/utils/text';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import { resolveConfigPath } from '$lib/utils/validation';
import type {
	ContentAdapter,
	ContentCreateOptions,
	ContentDeleteOptions,
	ContentFetchOptions,
	ContentOperationContext,
	ContentPreviewOptions,
	ContentSaveOptions
} from './types';

type FileBackedConfig = ParsedContentConfig & {
	content: {
		mode: 'file';
		path: string;
		itemsPath?: string;
	};
};
type FileCollectionConfig = FileBackedConfig & {
	content: FileBackedConfig['content'] & { itemsPath: string };
};
type JsonContainer = Record<string, unknown> | unknown[];

function isFileCollectionConfig(config: FileBackedConfig): config is FileCollectionConfig {
	return typeof config.content.itemsPath === 'string' && config.content.itemsPath.length > 0;
}

function asFileBackedConfig(context: ContentOperationContext): FileBackedConfig {
	if (context.config.content.mode !== 'file') {
		throw new Error(`Expected file-backed content, received ${context.config.content.mode}`);
	}

	return context.config as FileBackedConfig;
}

function getResolvedFilePath(context: ContentOperationContext): string {
	return resolveConfigPath(context.configPath, asFileBackedConfig(context).content.path);
}

function getWriteOptions(branch: string | undefined, message: string) {
	return { ref: branch, message };
}

async function readJsonFile(
	context: ContentOperationContext,
	branch?: string
): Promise<{ filePath: string; json: JsonContainer; raw: string; indent: string | number }> {
	const filePath = getResolvedFilePath(context);
	const raw = await context.backend.readTextFile(filePath, { ref: branch });

	return {
		filePath,
		json: JSON.parse(raw) as JsonContainer,
		raw,
		indent: detectJsonIndent(raw)
	};
}

function getArrayItems(json: JsonContainer, config: FileCollectionConfig): ContentRecord[] {
	const items = JSONPath({ path: config.content.itemsPath, json, wrap: false });

	if (!Array.isArray(items)) {
		throw new Error('content.itemsPath did not resolve to an array');
	}

	return items as ContentRecord[];
}

function writeArrayItems(
	json: JsonContainer,
	config: FileCollectionConfig,
	items: ContentRecord[]
): void {
	JSONPath({
		path: config.content.itemsPath,
		json,
		callback: () => items,
		wrap: false
	});
}

function maybeAssignGeneratedId(config: FileCollectionConfig, item: ContentRecord): void {
	if (!config.idField) {
		return;
	}

	const idBlock = findBlockById(config.blocks, config.idField);

	if (idBlock?.generated) {
		item[config.idField] = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}
}

function getItemIndexByRouteOrId(
	items: ContentRecord[],
	config: ParsedContentConfig,
	itemRouteOrId: string
): number {
	return items.findIndex(
		(item) =>
			getItemRoute(config, item) === itemRouteOrId || getItemId(item) === itemRouteOrId
	);
}

async function previewFileContent(
	context: ContentOperationContext,
	data: ContentRecord,
	options?: ContentPreviewOptions
) {
	const config = asFileBackedConfig(context);
	const filePath = getResolvedFilePath(context);

	if (!isFileCollectionConfig(config)) {
		let oldContent: string | undefined;
		let type: 'create' | 'update' = 'update';
		let indent: string | number = 2;

		try {
			oldContent = await context.backend.readTextFile(filePath, { ref: options?.branch });
			indent = detectJsonIndent(oldContent);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
				type = 'create';
			} else {
				type = (await context.backend.fileExists(filePath, { ref: options?.branch }))
					? 'update'
					: 'create';
				if (type === 'update') {
					throw error;
				}
			}
		}

		const newContent = toJsonFileContent(data, indent);

		return {
			files: [
				{
					path: filePath,
					type,
					oldContent,
					newContent,
					size: getUtf8ByteLength(newContent)
				}
			],
			totalChanges: 1
		};
	}

	const oldContent = await context.backend.readTextFile(filePath, { ref: options?.branch });
	const json = JSON.parse(oldContent) as JsonContainer;
	const indent = detectJsonIndent(oldContent);
	const items = getArrayItems(json, config);
	const nextData = ensureTentmanItemId(config, data);

	if (options?.isNew) {
		items.push(nextData);
	} else if (options?.itemId !== undefined) {
		const index = getItemIndexByRouteOrId(items, config, options.itemId);
		if (index === -1) {
			throw new Error('Item not found in file-backed collection');
		}

		items[index] = nextData;
	} else if (options?.itemIndex !== undefined) {
		if (options.itemIndex < 0 || options.itemIndex >= items.length) {
			throw new Error('Item not found in file-backed collection');
		}

		items[options.itemIndex] = nextData;
	} else {
		throw new Error('itemId or itemIndex is required to preview file-backed collection updates');
	}

	writeArrayItems(json, config, items);
	const newContent = toJsonFileContent(json as ContentRecord | ContentRecord[], indent);

	return {
		files: [
			{
				path: filePath,
				type: 'update' as const,
				oldContent,
				newContent,
				size: getUtf8ByteLength(newContent)
			}
		],
		totalChanges: 1
	};
}

async function fetchFileContent(
	context: ContentOperationContext,
	options?: ContentFetchOptions
): Promise<ContentDocument> {
	const config = asFileBackedConfig(context);
	const filePath = getResolvedFilePath(context);
	const raw = await context.backend.readTextFile(filePath, { ref: options?.branch });

	if (!isFileCollectionConfig(config)) {
		return JSON.parse(raw) as ContentRecord;
	}

	const json = JSON.parse(raw);
	const items = getArrayItems(json as JsonContainer, config);
	return normalizeRuntimeCollectionItemIds(config, items);
}

async function saveFileContent(
	context: ContentOperationContext,
	data: ContentRecord,
	options?: ContentSaveOptions
): Promise<void> {
	const config = asFileBackedConfig(context);

	if (!isFileCollectionConfig(config)) {
		const filePath = getResolvedFilePath(context);
		const existingContent = await context.backend.readTextFile(filePath, { ref: options?.branch });
		const indent = detectJsonIndent(existingContent);
		const message = generateCommitMessage('update', config.label);

		await context.backend.writeTextFile(
			filePath,
			toJsonFileContent(data, indent),
			getWriteOptions(options?.branch, message)
		);
		return;
	}

	const { filePath, json, indent } = await readJsonFile(context, options?.branch);
	const items = getArrayItems(json, config);
	const nextData = ensureTentmanItemId(config, data);

	let itemIdentifier: string | undefined;
	let itemFound = false;

	if (options?.itemId !== undefined) {
		const index = getItemIndexByRouteOrId(items, config, options.itemId);
		if (index !== -1) {
			items[index] = nextData;
			itemIdentifier = getItemSlug(config, nextData) ?? String(options.itemId);
			itemFound = true;
		}
	} else if (options?.itemIndex !== undefined) {
		if (options.itemIndex >= 0 && options.itemIndex < items.length) {
			items[options.itemIndex] = nextData;
			itemIdentifier = getItemSlug(config, nextData) ?? `item ${options.itemIndex + 1}`;
			itemFound = true;
		}
	}

	if (!itemFound) {
		throw new Error('Item not found in file-backed collection');
	}

	writeArrayItems(json, config, items);

	const message = generateCommitMessage('update', config.label, itemIdentifier);
	await context.backend.writeTextFile(
		filePath,
		toJsonFileContent(json as ContentRecord | ContentRecord[], indent),
		getWriteOptions(options?.branch, message)
	);
}

async function createFileContent(
	context: ContentOperationContext,
	data: ContentRecord,
	options?: ContentCreateOptions
): Promise<void> {
	const config = asFileBackedConfig(context);

	if (!isFileCollectionConfig(config)) {
		throw new Error('Cannot create items for file-backed singleton content');
	}

	const { filePath, json, indent } = await readJsonFile(context, options?.branch);
	const items = getArrayItems(json, config);
	const newItem = ensureTentmanItemId(config, { ...data });

	maybeAssignGeneratedId(config, newItem);
	items.push(newItem);
	writeArrayItems(json, config, items);

	const itemIdentifier = getItemSlug(config, newItem) ?? 'new item';
	const message = generateCommitMessage('create', config.label, itemIdentifier);

	await context.backend.writeTextFile(
		filePath,
		toJsonFileContent(json as ContentRecord | ContentRecord[], indent),
		getWriteOptions(options?.branch, message)
	);
}

async function deleteFileContent(
	context: ContentOperationContext,
	options: ContentDeleteOptions
): Promise<void> {
	const config = asFileBackedConfig(context);

	if (!isFileCollectionConfig(config)) {
		throw new Error('Cannot delete items from file-backed singleton content');
	}

	const { filePath, json, indent } = await readJsonFile(context, options.branch);
	const items = getArrayItems(json, config);

	let itemIdentifier: string | undefined;
	let itemFound = false;

	if (options.itemId !== undefined) {
		const index = getItemIndexByRouteOrId(items, config, options.itemId);
		if (index !== -1) {
			itemIdentifier = getItemSlug(config, items[index]!) ?? String(options.itemId);
			items.splice(index, 1);
			itemFound = true;
		}
	} else if (options.itemIndex !== undefined) {
		if (options.itemIndex >= 0 && options.itemIndex < items.length) {
			const item = items[options.itemIndex];
			itemIdentifier = getItemSlug(config, item) ?? `item ${options.itemIndex + 1}`;
			items.splice(options.itemIndex, 1);
			itemFound = true;
		}
	}

	if (!itemFound) {
		throw new Error('Item not found in file-backed collection');
	}

	writeArrayItems(json, config, items);

	const message = generateCommitMessage('delete', config.label, itemIdentifier);
	await context.backend.writeTextFile(
		filePath,
		toJsonFileContent(json as ContentRecord | ContentRecord[], indent),
		getWriteOptions(options.branch, message)
	);
}

export const fileContentAdapter: ContentAdapter = {
	mode: 'file',
	fetch: fetchFileContent,
	save: saveFileContent,
	create: createFileContent,
	delete: deleteFileContent,
	preview: previewFileContent
};
