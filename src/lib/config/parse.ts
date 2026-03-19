import type {
	BlockConfig,
	BlockUsage,
	ContentConfig,
	ContentMode,
	DirectoryContentMode,
	FileContentMode,
	RootConfig,
	TentmanConfigFile
} from '$lib/config/types';
import { buildFields, type FieldDefinition } from '$lib/types/config';

interface ParsedContentConfigBase extends ContentConfig {
	fields: Record<string, FieldDefinition>;
	imagePath?: string;
}

export interface ParsedSingletonConfig extends ParsedContentConfigBase {
	content: FileContentMode;
	contentFile: string;
}

export interface ParsedSingleFileArrayConfig extends ParsedContentConfigBase {
	content: FileContentMode & { itemsPath: string };
	contentFile: string;
	collectionPath: string;
}

export interface ParsedMultiFileCollectionConfig extends ParsedContentConfigBase {
	content: DirectoryContentMode;
	template: string;
	filename?: string;
}

export type ParsedContentConfig =
	| ParsedSingletonConfig
	| ParsedSingleFileArrayConfig
	| ParsedMultiFileCollectionConfig;

export interface ParsedBlockConfig extends BlockConfig {
	fields: Record<string, FieldDefinition>;
}

export type ParsedConfigFile = ParsedContentConfig | ParsedBlockConfig;

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}
}

function readOptionalString(
	value: Record<string, unknown>,
	key: string,
	context: string
): string | undefined {
	const candidate = value[key];

	if (candidate === undefined) {
		return undefined;
	}

	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new Error(`${context}.${key} must be a non-empty string`);
	}

	return candidate;
}

function readOptionalBoolean(
	value: Record<string, unknown>,
	key: string,
	context: string
): boolean | undefined {
	const candidate = value[key];

	if (candidate === undefined) {
		return undefined;
	}

	if (typeof candidate !== 'boolean') {
		throw new Error(`${context}.${key} must be a boolean`);
	}

	return candidate;
}

function readRequiredString(value: Record<string, unknown>, key: string, context: string): string {
	const candidate = readOptionalString(value, key, context);

	if (!candidate) {
		throw new Error(`${context}.${key} is required`);
	}

	return candidate;
}

function readBlocks(value: Record<string, unknown>, context: string): BlockUsage[] {
	const blocks = value.blocks;

	if (!Array.isArray(blocks) || blocks.length === 0) {
		throw new Error(`${context}.blocks must be a non-empty array`);
	}

	return blocks.map((block, index) => parseBlockUsage(block, `${context}.blocks[${index}]`));
}

function parseBlockUsage(input: unknown, context: string): BlockUsage {
	assertObject(input, `${context} must be an object`);

	const id = readRequiredString(input, 'id', context);
	const type = readRequiredString(input, 'type', context);
	const label = readOptionalString(input, 'label', context);
	const required = readOptionalBoolean(input, 'required', context);
	const collection = readOptionalBoolean(input, 'collection', context);
	const itemLabel = readOptionalString(input, 'itemLabel', context);
	const assetsDir = readOptionalString(input, 'assetsDir', context);
	const generated = readOptionalBoolean(input, 'generated', context);
	const show = input.show;
	const minLength = input.minLength;
	const maxLength = input.maxLength;

	if (show !== undefined && show !== 'primary' && show !== 'secondary') {
		throw new Error(`${context}.show must be "primary" or "secondary"`);
	}

	if (minLength !== undefined && (typeof minLength !== 'number' || Number.isNaN(minLength))) {
		throw new Error(`${context}.minLength must be a number`);
	}

	if (maxLength !== undefined && (typeof maxLength !== 'number' || Number.isNaN(maxLength))) {
		throw new Error(`${context}.maxLength must be a number`);
	}

	if (type === 'block') {
		const blocks = readBlocks(input, context);

		if ('content' in input && input.content !== undefined) {
			throw new Error(`${context}.content is not supported for inline block definitions`);
		}

		return {
			id,
			type,
			...(label && { label }),
			...(required !== undefined && { required }),
			...(collection !== undefined && { collection }),
			...(itemLabel && { itemLabel }),
			...(assetsDir && { assetsDir }),
			...(generated !== undefined && { generated }),
			...(show && { show }),
			...(minLength !== undefined && { minLength }),
			...(maxLength !== undefined && { maxLength }),
			blocks
		};
	}

	return {
		id,
		type,
		...(label && { label }),
		...(required !== undefined && { required }),
		...(collection !== undefined && { collection }),
		...(itemLabel && { itemLabel }),
		...(assetsDir && { assetsDir }),
		...(generated !== undefined && { generated }),
		...(show && { show }),
		...(minLength !== undefined && { minLength }),
		...(maxLength !== undefined && { maxLength })
	};
}

function parseContentMode(input: unknown, context: string): ContentMode {
	assertObject(input, `${context} must be an object`);

	const mode = readRequiredString(input, 'mode', context);

	if (mode === 'file') {
		return {
			mode,
			path: readRequiredString(input, 'path', context),
			...(readOptionalString(input, 'itemsPath', context) && {
				itemsPath: readOptionalString(input, 'itemsPath', context)
			})
		} as FileContentMode;
	}

	if (mode === 'directory') {
		return {
			mode,
			path: readRequiredString(input, 'path', context),
			template: readRequiredString(input, 'template', context),
			...(readOptionalString(input, 'filename', context) && {
				filename: readOptionalString(input, 'filename', context)
			})
		} as DirectoryContentMode;
	}

	if (mode === 'embedded') {
		return { mode };
	}

	throw new Error(`${context}.mode must be "embedded", "file", or "directory"`);
}

function parseContentConfig(input: Record<string, unknown>): ParsedContentConfig {
	const collection = readOptionalBoolean(input, 'collection', 'config');
	const content = parseContentMode(input.content, 'config.content');

	if (content.mode === 'embedded') {
		throw new Error('config.content.mode must be "file" or "directory" for top-level content configs');
	}

	const config: ContentConfig = {
		type: 'content',
		label: readRequiredString(input, 'label', 'config'),
		...(readOptionalString(input, 'itemLabel', 'config') && {
			itemLabel: readOptionalString(input, 'itemLabel', 'config')
		}),
		...(collection !== undefined && { collection }),
		...(readOptionalString(input, 'idField', 'config') && {
			idField: readOptionalString(input, 'idField', 'config')
		}),
		content,
		blocks: readBlocks(input, 'config')
	};

	if (config.collection && !config.itemLabel) {
		throw new Error('config.itemLabel is required when config.collection is true');
	}

	const fields = buildFields(config.blocks);

	if (content.mode === 'directory') {
		const directoryConfig: ParsedMultiFileCollectionConfig = {
			...config,
			content,
			collection: config.collection ?? true,
			fields,
			template: content.template,
			...(content.filename && { filename: content.filename })
		};

		return directoryConfig;
	}

	if (content.itemsPath) {
		const arrayConfig: ParsedSingleFileArrayConfig = {
			...config,
			fields,
			content: content as FileContentMode & { itemsPath: string },
			contentFile: content.path,
			collectionPath: content.itemsPath
		};

		return arrayConfig;
	}

	const singletonConfig: ParsedSingletonConfig = {
		...config,
		content,
		fields,
		contentFile: content.path
	};

	return singletonConfig;
}

function parseBlockConfig(input: Record<string, unknown>): ParsedBlockConfig {
	const collection = readOptionalBoolean(input, 'collection', 'config');
	const config: BlockConfig = {
		type: 'block',
		id: readRequiredString(input, 'id', 'config'),
		label: readRequiredString(input, 'label', 'config'),
		...(readOptionalString(input, 'itemLabel', 'config') && {
			itemLabel: readOptionalString(input, 'itemLabel', 'config')
		}),
		...(collection !== undefined && { collection }),
		...(readOptionalString(input, 'adapter', 'config') && {
			adapter: readOptionalString(input, 'adapter', 'config')
		}),
		blocks: readBlocks(input, 'config')
	};

	if (config.collection && !config.itemLabel) {
		throw new Error('config.itemLabel is required when config.collection is true');
	}

	return {
		...config,
		fields: buildFields(config.blocks)
	};
}

export function parseRootConfig(content: string): RootConfig {
	const parsed = JSON.parse(content) as unknown;
	assertObject(parsed, 'Root config must be an object');

	const netlify = parsed.netlify;
	const local = parsed.local;
	const rootConfig: RootConfig = {};

	const blocksDir = readOptionalString(parsed, 'blocksDir', 'root');
	const configsDir = readOptionalString(parsed, 'configsDir', 'root');
	const assetsDir = readOptionalString(parsed, 'assetsDir', 'root');

	if (blocksDir) {
		rootConfig.blocksDir = blocksDir;
	}

	if (configsDir) {
		rootConfig.configsDir = configsDir;
	}

	if (assetsDir) {
		rootConfig.assetsDir = assetsDir;
	}

	if (netlify && typeof netlify === 'object') {
		rootConfig.netlify = netlify as RootConfig['netlify'];
	}

	if (local && typeof local === 'object') {
		rootConfig.local = local as RootConfig['local'];
	}

	return rootConfig;
}

export function parseConfigFile(content: string): ParsedConfigFile {
	const parsed = JSON.parse(content) as unknown;
	assertObject(parsed, 'Tentman config must be an object');

	const type = readRequiredString(parsed, 'type', 'config');

	if (type === 'content') {
		return parseContentConfig(parsed);
	}

	if (type === 'block') {
		return parseBlockConfig(parsed);
	}

	throw new Error('config.type must be "content" or "block"');
}

export function isParsedContentConfig(config: ParsedConfigFile): config is ParsedContentConfig {
	return config.type === 'content';
}

export function isParsedBlockConfig(config: ParsedConfigFile): config is ParsedBlockConfig {
	return config.type === 'block';
}
