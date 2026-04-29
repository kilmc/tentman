import type {
	BlockConfig,
	BlockUsage,
	CollectionBehaviorConfig,
	CollectionGroupConfig,
	ContentConfig,
	DirectoryContentMode,
	FileContentMode,
	NavigationGroupsSelectBlockOptions,
	PrimitiveBlockType,
	RootConfig,
	SelectBlockOptions
} from '$lib/config/types';

export interface ParsedContentConfig extends ContentConfig {
	content: FileContentMode | DirectoryContentMode;
	imagePath?: string;
}

export type ParsedBlockConfig = BlockConfig;

export type ParsedConfigFile = ParsedContentConfig | ParsedBlockConfig;

type LegacyFieldType = PrimitiveBlockType | 'array';
type LegacyFieldInput =
	| string
	| {
			type?: string;
			label?: unknown;
			required?: unknown;
			generated?: unknown;
			show?: unknown;
			fields?: unknown;
			minLength?: unknown;
			maxLength?: unknown;
			itemLabel?: unknown;
			assetsDir?: unknown;
			options?: unknown;
	  };
type LegacyFieldArrayItem = {
	property?: unknown;
	type?: unknown;
	label?: unknown;
	required?: unknown;
	generated?: unknown;
	show?: unknown;
	fields?: unknown;
	minLength?: unknown;
	maxLength?: unknown;
	itemLabel?: unknown;
	assetsDir?: unknown;
	options?: unknown;
};

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

function readOptionalStringArray(
	value: Record<string, unknown>,
	key: string,
	context: string
): string[] | undefined {
	const candidate = value[key];

	if (candidate === undefined) {
		return undefined;
	}

	if (!Array.isArray(candidate)) {
		throw new Error(`${context}.${key} must be an array of non-empty strings`);
	}

	return candidate.map((item, index) => {
		if (typeof item !== 'string' || item.length === 0) {
			throw new Error(`${context}.${key}[${index}] must be a non-empty string`);
		}

		return item;
	});
}

function readRequiredString(value: Record<string, unknown>, key: string, context: string): string {
	const candidate = readOptionalString(value, key, context);

	if (!candidate) {
		throw new Error(`${context}.${key} is required`);
	}

	return candidate;
}

function readStaticSelectOptions(candidate: unknown, context: string): SelectBlockOptions {
	if (!Array.isArray(candidate) || candidate.length === 0) {
		throw new Error(`${context}.options must be a non-empty array`);
	}

	return candidate.map((item, index) => {
		const itemContext = `${context}.options[${index}]`;

		if (typeof item === 'string' && item.length > 0) {
			return {
				value: item,
				label: getLabelFromOptionValue(item)
			};
		}

		assertObject(item, `${itemContext} must be a non-empty string or an option object`);

		return {
			value: readRequiredString(item, 'value', itemContext),
			label: readRequiredString(item, 'label', itemContext)
		};
	});
}

function readNavigationGroupsSelectOptions(
	value: Record<string, unknown>,
	context: string
): NavigationGroupsSelectBlockOptions {
	const source = value.source;

	if (source !== 'tentman.navigationGroups') {
		throw new Error(`${context}.options.source must be "tentman.navigationGroups"`);
	}

	const collection = readRequiredString(value, 'collection', `${context}.options`);
	const addOption = readOptionalBoolean(value, 'addOption', `${context}.options`);
	const supportedKeys = new Set(['source', 'collection', 'addOption']);
	const unsupportedKeys = Object.keys(value).filter((key) => !supportedKeys.has(key));

	if (unsupportedKeys.length > 0) {
		throw new Error(
			`${context}.options has unsupported key${unsupportedKeys.length === 1 ? '' : 's'}: ${unsupportedKeys.join(', ')}`
		);
	}

	return {
		source,
		collection,
		...(addOption !== undefined && { addOption })
	};
}

function readSelectOptions(value: Record<string, unknown>, context: string): SelectBlockOptions {
	const candidate = value.options;

	if (Array.isArray(candidate)) {
		return readStaticSelectOptions(candidate, context);
	}

	assertObject(
		candidate,
		`${context}.options must be a non-empty array or a sourced options object`
	);

	return readNavigationGroupsSelectOptions(candidate, context);
}

function getLabelFromOptionValue(value: string): string {
	return value
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function readBlocks(value: Record<string, unknown>, context: string): BlockUsage[] {
	const blocks = value.blocks;

	if (!Array.isArray(blocks) || blocks.length === 0) {
		throw new Error(`${context}.blocks must be a non-empty array`);
	}

	return blocks.map((block, index) => parseBlockUsage(block, `${context}.blocks[${index}]`));
}

function parseCollectionGroupConfig(input: unknown, context: string): CollectionGroupConfig {
	assertObject(input, `${context} must be an object`);

	return {
		...(readOptionalString(input, '_tentmanId', context) && {
			_tentmanId: readOptionalString(input, '_tentmanId', context)
		}),
		label: readRequiredString(input, 'label', context),
		...(readOptionalString(input, 'slug', context) && {
			slug: readOptionalString(input, 'slug', context)
		})
	};
}

function parseCollectionBehaviorConfig(
	input: unknown,
	context: string
): CollectionBehaviorConfig | true | undefined {
	if (input === undefined) {
		return undefined;
	}

	if (input === true) {
		return true;
	}

	assertObject(input, `${context} must be true or an object`);

	const sorting = input.sorting;
	if (sorting !== undefined && sorting !== 'manual') {
		throw new Error(`${context}.sorting must be "manual" when present`);
	}

	const groups = input.groups;
	if (groups !== undefined && !Array.isArray(groups)) {
		throw new Error(`${context}.groups must be an array when present`);
	}

	return {
		...(sorting === 'manual' ? { sorting } : {}),
		...(groups ? { groups: groups.map((group, index) => parseCollectionGroupConfig(group, `${context}.groups[${index}]`)) } : {})
	};
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
	const plugins = readOptionalStringArray(input, 'plugins', context);
	const generated = readOptionalBoolean(input, 'generated', context);
	const show = input.show;
	const minLength = input.minLength;
	const maxLength = input.maxLength;
	const options = type === 'select' ? readSelectOptions(input, context) : undefined;

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
			...(plugins && { plugins }),
			...(generated !== undefined && { generated }),
			...(show && { show }),
			...(minLength !== undefined && { minLength }),
			...(maxLength !== undefined && { maxLength }),
			blocks
		};
	}

	if (plugins && type !== 'markdown') {
		throw new Error(`${context}.plugins is only supported on markdown fields in v1`);
	}

	if (type !== 'select' && 'options' in input && input.options !== undefined) {
		throw new Error(`${context}.options is only supported on select fields`);
	}

	return {
		id,
		type,
		...(label && { label }),
		...(required !== undefined && { required }),
		...(collection !== undefined && { collection }),
		...(itemLabel && { itemLabel }),
		...(assetsDir && { assetsDir }),
		...(plugins && { plugins }),
		...(generated !== undefined && { generated }),
		...(show && { show }),
		...(minLength !== undefined && { minLength }),
		...(maxLength !== undefined && { maxLength }),
		...(options && { options })
	};
}

function parseContentMode(input: unknown, context: string): FileContentMode | DirectoryContentMode {
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

	throw new Error(`${context}.mode must be "file" or "directory" for top-level content configs`);
}

function parseContentConfig(input: Record<string, unknown>): ParsedContentConfig {
	const collection = parseCollectionBehaviorConfig(input.collection, 'config.collection');
	const content = parseContentMode(input.content, 'config.content');

	const config: ParsedContentConfig = {
		type: 'content',
		label: readRequiredString(input, 'label', 'config'),
		...(readOptionalString(input, 'id', 'config') && {
			id: readOptionalString(input, 'id', 'config')
		}),
		...(readOptionalString(input, '_tentmanId', 'config') && {
			_tentmanId: readOptionalString(input, '_tentmanId', 'config')
		}),
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

	if (content.mode === 'directory') {
		return {
			...config,
			content,
			collection: config.collection ?? true
		};
	}

	return {
		...config,
		content
	};
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
		...config
	};
}

function normalizeLegacyFieldId(id: string): string {
	return id === '_body' ? 'body' : id;
}

function isLegacyFieldType(type: string): type is LegacyFieldType {
	return (
		type === 'text' ||
		type === 'textarea' ||
		type === 'markdown' ||
		type === 'email' ||
		type === 'url' ||
		type === 'number' ||
		type === 'date' ||
		type === 'boolean' ||
		type === 'image' ||
		type === 'select' ||
		type === 'array'
	);
}

function readLegacyFieldType(type: unknown, context: string): LegacyFieldType {
	if (typeof type !== 'string' || type.length === 0) {
		throw new Error(`${context}.type must be a non-empty string`);
	}

	if (!isLegacyFieldType(type)) {
		throw new Error(`${context}.type "${type}" is not supported in legacy configs`);
	}

	return type;
}

function parseLegacyFieldArrayItem(input: unknown, context: string): BlockUsage {
	assertObject(input, `${context} must be an object`);

	const rawField = input as LegacyFieldArrayItem;
	const property = readRequiredString(rawField as Record<string, unknown>, 'property', context);
	const id = normalizeLegacyFieldId(property);
	const type = readLegacyFieldType(rawField.type, context);
	const label = readOptionalString(rawField as Record<string, unknown>, 'label', context);
	const required = readOptionalBoolean(rawField as Record<string, unknown>, 'required', context);
	const generated = readOptionalBoolean(rawField as Record<string, unknown>, 'generated', context);
	const show = rawField.show;
	const minLength = rawField.minLength;
	const maxLength = rawField.maxLength;
	const itemLabel = readOptionalString(rawField as Record<string, unknown>, 'itemLabel', context);
	const assetsDir = readOptionalString(rawField as Record<string, unknown>, 'assetsDir', context);
	const options =
		type === 'select'
			? readSelectOptions(rawField as Record<string, unknown>, context)
			: undefined;

	if (show !== undefined && show !== 'primary' && show !== 'secondary') {
		throw new Error(`${context}.show must be "primary" or "secondary"`);
	}

	if (minLength !== undefined && (typeof minLength !== 'number' || Number.isNaN(minLength))) {
		throw new Error(`${context}.minLength must be a number`);
	}

	if (maxLength !== undefined && (typeof maxLength !== 'number' || Number.isNaN(maxLength))) {
		throw new Error(`${context}.maxLength must be a number`);
	}

	if (type === 'array') {
		return {
			id,
			type: 'block',
			...(label && { label }),
			...(required !== undefined && { required }),
			...(generated !== undefined && { generated }),
			...(show && { show }),
			...(minLength !== undefined && { minLength }),
			...(maxLength !== undefined && { maxLength }),
			...(itemLabel && { itemLabel }),
			...(assetsDir && { assetsDir }),
			collection: true,
			blocks: parseLegacyFields(rawField.fields ?? {}, `${context}.fields`)
		};
	}

	return {
		id,
		type,
		...(label && { label }),
		...(required !== undefined && { required }),
		...(generated !== undefined && { generated }),
		...(show && { show }),
		...(minLength !== undefined && { minLength }),
		...(maxLength !== undefined && { maxLength }),
		...(assetsDir && { assetsDir }),
		...(options && { options })
	};
}

function parseLegacyFieldObjectEntry(
	id: string,
	input: LegacyFieldInput,
	context: string
): BlockUsage {
	const normalizedId = normalizeLegacyFieldId(id);

	if (typeof input === 'string') {
		return {
			id: normalizedId,
			type: readLegacyFieldType(input, context)
		};
	}

	assertObject(input, `${context} must be an object or string`);

	const type = readLegacyFieldType(input.type, context);
	const label = readOptionalString(input, 'label', context);
	const required = readOptionalBoolean(input, 'required', context);
	const generated = readOptionalBoolean(input, 'generated', context);
	const show = input.show;
	const minLength = input.minLength;
	const maxLength = input.maxLength;
	const itemLabel = readOptionalString(input, 'itemLabel', context);
	const assetsDir = readOptionalString(input, 'assetsDir', context);
	const options = type === 'select' ? readSelectOptions(input, context) : undefined;

	if (show !== undefined && show !== 'primary' && show !== 'secondary') {
		throw new Error(`${context}.show must be "primary" or "secondary"`);
	}

	if (minLength !== undefined && (typeof minLength !== 'number' || Number.isNaN(minLength))) {
		throw new Error(`${context}.minLength must be a number`);
	}

	if (maxLength !== undefined && (typeof maxLength !== 'number' || Number.isNaN(maxLength))) {
		throw new Error(`${context}.maxLength must be a number`);
	}

	if (type === 'array') {
		return {
			id: normalizedId,
			type: 'block',
			...(label && { label }),
			...(required !== undefined && { required }),
			...(generated !== undefined && { generated }),
			...(show && { show }),
			...(minLength !== undefined && { minLength }),
			...(maxLength !== undefined && { maxLength }),
			...(itemLabel && { itemLabel }),
			...(assetsDir && { assetsDir }),
			collection: true,
			blocks: parseLegacyFields(input.fields ?? {}, `${context}.fields`)
		};
	}

	return {
		id: normalizedId,
		type,
		...(label && { label }),
		...(required !== undefined && { required }),
		...(generated !== undefined && { generated }),
		...(show && { show }),
		...(minLength !== undefined && { minLength }),
		...(maxLength !== undefined && { maxLength }),
		...(assetsDir && { assetsDir }),
		...(options && { options })
	};
}

function parseLegacyFields(input: unknown, context: string): BlockUsage[] {
	if (Array.isArray(input)) {
		return input.map((field, index) => parseLegacyFieldArrayItem(field, `${context}[${index}]`));
	}

	assertObject(input, `${context} must be an object or array`);

	return Object.entries(input).map(([id, field]) =>
		parseLegacyFieldObjectEntry(id, field as LegacyFieldInput, `${context}.${id}`)
	);
}

function inferLegacyIdField(
	filename: string | undefined,
	blocks: BlockUsage[]
): string | undefined {
	if (!filename) {
		return undefined;
	}

	const match = filename.match(/^\{\{(\w+)\}\}$/);
	if (!match) {
		return undefined;
	}

	const candidate = match[1];
	return blocks.some((block) => block.id === candidate) ? candidate : undefined;
}

function parseLegacyContentConfig(input: Record<string, unknown>): ParsedContentConfig {
	const label = readRequiredString(input, 'label', 'config');
	const template = readOptionalString(input, 'template', 'config');
	const contentFile = readOptionalString(input, 'contentFile', 'config');

	if (!template && !contentFile) {
		throw new Error(
			'Legacy content config must include either config.template or config.contentFile'
		);
	}

	const blocks = parseLegacyFields(input.fields, 'config.fields');
	const filename = readOptionalString(input, 'filename', 'config');
	const idField =
		readOptionalString(input, 'idField', 'config') ??
		(template ? inferLegacyIdField(filename, blocks) : undefined);
	const content =
		template !== undefined
			? ({
					mode: 'directory',
					path: '.',
					template,
					...(filename && { filename })
				} satisfies DirectoryContentMode)
			: ({
					mode: 'file',
					path: contentFile!
				} satisfies FileContentMode);
	const collection =
		readOptionalBoolean(input, 'collection', 'config') ?? content.mode === 'directory';

	return {
		type: 'content',
		label,
		...(readOptionalString(input, 'id', 'config') && {
			id: readOptionalString(input, 'id', 'config')
		}),
		...(readOptionalString(input, '_tentmanId', 'config') && {
			_tentmanId: readOptionalString(input, '_tentmanId', 'config')
		}),
		...(readOptionalString(input, 'itemLabel', 'config') && {
			itemLabel: readOptionalString(input, 'itemLabel', 'config')
		}),
		...(collection !== undefined && { collection }),
		...(idField && { idField }),
		content,
		blocks
	};
}

export function parseBlockConfigObject(input: unknown): ParsedBlockConfig {
	assertObject(input, 'Block config must be an object');
	return parseBlockConfig(input);
}

export function parseRootConfig(content: string): RootConfig {
	const parsed = JSON.parse(content) as unknown;
	assertObject(parsed, 'Root config must be an object');

	const netlify = parsed.netlify;
	const local = parsed.local;
	const rootConfig: RootConfig = {};

	const siteName = readOptionalString(parsed, 'siteName', 'root');
	const blocksDir = readOptionalString(parsed, 'blocksDir', 'root');
	const configsDir = readOptionalString(parsed, 'configsDir', 'root');
	const assetsDir = readOptionalString(parsed, 'assetsDir', 'root');
	const pluginsDir = readOptionalString(parsed, 'pluginsDir', 'root');
	const plugins = readOptionalStringArray(parsed, 'plugins', 'root');
	const blockPackages = readOptionalStringArray(parsed, 'blockPackages', 'root');
	const debugConfig = parsed.debug;
	const contentConfig = parsed.content;

	if (siteName) {
		rootConfig.siteName = siteName;
	}

	if (blocksDir) {
		rootConfig.blocksDir = blocksDir;
	}

	if (configsDir) {
		rootConfig.configsDir = configsDir;
	}

	if (assetsDir) {
		rootConfig.assetsDir = assetsDir;
	}

	if (pluginsDir) {
		rootConfig.pluginsDir = pluginsDir;
	}

	if (plugins) {
		rootConfig.plugins = plugins;
	}

	if (blockPackages) {
		rootConfig.blockPackages = blockPackages;
	}

	if (debugConfig !== undefined) {
		assertObject(debugConfig, 'root.debug must be an object');

		const cacheConfigs = readOptionalBoolean(debugConfig, 'cacheConfigs', 'root.debug');
		rootConfig.debug = {
			...(cacheConfigs !== undefined ? { cacheConfigs } : {})
		};
	}

	if (contentConfig !== undefined) {
		assertObject(contentConfig, 'root.content must be an object');

		if (contentConfig.sorting !== undefined && contentConfig.sorting !== 'manual') {
			throw new Error('root.content.sorting must be "manual" when present');
		}

		rootConfig.content = {
			...(contentConfig.sorting === 'manual' ? { sorting: 'manual' as const } : {})
		};
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

	const type = readOptionalString(parsed, 'type', 'config');

	if (!type) {
		return parseLegacyContentConfig(parsed);
	}

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
