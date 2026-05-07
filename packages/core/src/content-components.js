import nunjucks from 'nunjucks';
import { assertPlainObject, parseJsonObject, readOptionalString, readRequiredString } from './json.js';

const COMPONENT_CONFIG_NAME = 'component.json';
const RENDER_TEMPLATE_NAME = 'render.njk';
const PREVIEW_TEMPLATE_NAME = 'preview.njk';
const VALID_COMPONENT_KINDS = new Set(['inline', 'block']);
const VALID_ATTRIBUTE_TYPES = new Set(['string', 'enum']);
const renderEnvironment = new nunjucks.Environment(undefined, {
	autoescape: true,
	throwOnUndefined: false
});

async function pathExists(absolutePath) {
	const fs = await import('node:fs/promises');

	try {
		await fs.access(absolutePath);
		return true;
	} catch {
		return false;
	}
}

async function readRequiredFile(filePath) {
	const fs = await import('node:fs/promises');

	try {
		return await fs.readFile(filePath, 'utf8');
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			throw new Error(`Missing required content component file: ${filePath}`);
		}

		throw error;
	}
}

function normalizeBooleanOption(value, key, context) {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'boolean') {
		throw new Error(`${context}.${key} must be a boolean`);
	}

	return value;
}

function normalizeAttributeDefinition(attributeName, input, context) {
	assertPlainObject(input, `${context}.${attributeName} must be an object`);

	const type = readRequiredString(input, 'type', `${context}.${attributeName}`);
	if (!VALID_ATTRIBUTE_TYPES.has(type)) {
		throw new Error(`${context}.${attributeName}.type must be "string" or "enum"`);
	}

	const normalized = {
		type,
		required: normalizeBooleanOption(input.required, 'required', `${context}.${attributeName}`) === true,
		valueFromMarkdownLabel:
			normalizeBooleanOption(
				input.valueFromMarkdownLabel,
				'valueFromMarkdownLabel',
				`${context}.${attributeName}`
			) === true
	};

	const defaultValue = readOptionalString(input, 'default', `${context}.${attributeName}`);
	if (defaultValue !== undefined) {
		normalized.default = defaultValue.trim();
		if (normalized.default.length === 0) {
			throw new Error(`${context}.${attributeName}.default must be a non-empty string`);
		}
	}

	if (type === 'enum') {
		const options = input.options;
		if (!Array.isArray(options) || options.length === 0) {
			throw new Error(`${context}.${attributeName}.options must be a non-empty array of strings`);
		}

		normalized.options = options.map((option, index) => {
			if (typeof option !== 'string' || option.trim().length === 0) {
				throw new Error(`${context}.${attributeName}.options[${index}] must be a non-empty string`);
			}

			return option.trim();
		});

		if (new Set(normalized.options).size !== normalized.options.length) {
			throw new Error(`${context}.${attributeName}.options must not contain duplicate values`);
		}

		if (normalized.default !== undefined && !normalized.options.includes(normalized.default)) {
			throw new Error(`${context}.${attributeName}.default must match one of the enum options`);
		}
	} else if (input.options !== undefined) {
		throw new Error(`${context}.${attributeName}.options is only supported for enum attributes`);
	}

	return normalized;
}

function normalizeDefinition(definition, componentJsonPath) {
	const kind = readOptionalString(definition, 'kind', componentJsonPath) ?? 'inline';
	if (!VALID_COMPONENT_KINDS.has(kind)) {
		throw new Error(`${componentJsonPath}.kind must be "inline" or "block"`);
	}

	const attributesInput = definition.attributes ?? {};
	assertPlainObject(attributesInput, `${componentJsonPath}.attributes must be an object`);

	const attributes = {};
	let markdownLabelAttributeCount = 0;

	for (const attributeName of Object.keys(attributesInput).sort()) {
		const attributeDefinition = normalizeAttributeDefinition(
			attributeName,
			attributesInput[attributeName],
			`${componentJsonPath}.attributes`
		);

		if (attributeDefinition.valueFromMarkdownLabel) {
			markdownLabelAttributeCount += 1;
		}

		attributes[attributeName] = attributeDefinition;
	}

	if (markdownLabelAttributeCount > 1) {
		throw new Error(`${componentJsonPath}.attributes may only declare one valueFromMarkdownLabel attribute`);
	}

	return {
		id: readRequiredString(definition, 'id', componentJsonPath),
		name: readRequiredString(definition, 'name', componentJsonPath),
		kind,
		attributes
	};
}

function getTemplateSource(component, mode) {
	if (mode === 'render') {
		return {
			path: component.renderTemplatePath,
			source: component.renderTemplateSource
		};
	}

	if (mode === 'preview') {
		return {
			path: component.previewTemplatePath,
			source: component.previewTemplateSource
		};
	}

	throw new Error(`Unsupported content component render mode: ${mode}`);
}

function handleDiscoveryError(error, onError) {
	if (onError === 'warn') {
		console.warn(error instanceof Error ? error.message : String(error));
		return;
	}

	throw error;
}

function findDuplicateValues(components, key) {
	const duplicates = new Set();
	const seenValues = new Set();

	for (const component of components) {
		const value = component.definition[key];

		if (seenValues.has(value)) {
			duplicates.add(value);
		}

		seenValues.add(value);
	}

	return duplicates;
}

function filterUniqueComponents(components) {
	const uniqueComponents = [];
	const acceptedIds = new Set();
	const acceptedNames = new Set();

	for (const component of components) {
		if (
			acceptedIds.has(component.definition.id) ||
			acceptedNames.has(component.definition.name)
		) {
			continue;
		}

		acceptedIds.add(component.definition.id);
		acceptedNames.add(component.definition.name);
		uniqueComponents.push(component);
	}

	return uniqueComponents;
}

export function collectContentComponents(components, options = {}) {
	if (!Array.isArray(components)) {
		throw new Error('collectContentComponents requires an array of loaded components');
	}

	const onError = options.onError ?? 'throw';
	if (onError !== 'throw' && onError !== 'warn') {
		throw new Error('collectContentComponents onError must be "throw" or "warn"');
	}

	const validatedComponents = [];

	for (const component of components) {
		try {
			validatedComponents.push(validateContentComponent(component));
		} catch (error) {
			handleDiscoveryError(error, onError);
		}
	}

	const duplicatesById = findDuplicateValues(validatedComponents, 'id');
	const duplicatesByName = findDuplicateValues(validatedComponents, 'name');

	if (duplicatesById.size > 0) {
		handleDiscoveryError(
			new Error(
				`Duplicate content component ids found: ${Array.from(duplicatesById).sort().join(', ')}`
			),
			onError
		);
	}

	if (duplicatesByName.size > 0) {
		handleDiscoveryError(
			new Error(
				`Duplicate content component names found: ${Array.from(duplicatesByName).sort().join(', ')}`
			),
			onError
		);
	}

	if (onError === 'warn' && (duplicatesById.size > 0 || duplicatesByName.size > 0)) {
		return filterUniqueComponents(validatedComponents);
	}

	return validatedComponents;
}

export async function loadContentComponent(directory) {
	const path = await import('node:path');
	const normalizedDirectory = path.resolve(directory);
	const componentJsonPath = path.join(normalizedDirectory, COMPONENT_CONFIG_NAME);
	const renderTemplatePath = path.join(normalizedDirectory, RENDER_TEMPLATE_NAME);
	const previewTemplatePath = path.join(normalizedDirectory, PREVIEW_TEMPLATE_NAME);

	const [componentJsonSource, renderTemplateSource, previewTemplateSource] = await Promise.all([
		readRequiredFile(componentJsonPath),
		readRequiredFile(renderTemplatePath),
		readRequiredFile(previewTemplatePath)
	]);

	return {
		directory: normalizedDirectory,
		componentJsonPath,
		renderTemplatePath,
		previewTemplatePath,
		renderTemplateSource,
		previewTemplateSource,
		definition: parseJsonObject(componentJsonSource, componentJsonPath)
	};
}

export function validateContentComponent(component) {
	assertPlainObject(component, 'content component must be an object');
	if (typeof component.directory !== 'string' || component.directory.length === 0) {
		throw new Error('content component.directory must be a non-empty string');
	}

	const componentJsonPath =
		typeof component.componentJsonPath === 'string' && component.componentJsonPath.length > 0
			? component.componentJsonPath
			: `${component.directory.replace(/\/+$/, '')}/${COMPONENT_CONFIG_NAME}`;

	if (typeof component.renderTemplatePath !== 'string' || component.renderTemplatePath.length === 0) {
		throw new Error('content component.renderTemplatePath must be a non-empty string');
	}

	if (typeof component.previewTemplatePath !== 'string' || component.previewTemplatePath.length === 0) {
		throw new Error('content component.previewTemplatePath must be a non-empty string');
	}

	if (typeof component.renderTemplateSource !== 'string') {
		throw new Error(`${component.renderTemplatePath} must be loaded as a string`);
	}

	if (typeof component.previewTemplateSource !== 'string') {
		throw new Error(`${component.previewTemplatePath} must be loaded as a string`);
	}

	assertPlainObject(component.definition, `${componentJsonPath} must be an object`);

	return {
		...component,
		definition: normalizeDefinition(component.definition, componentJsonPath)
	};
}

export async function discoverContentComponents(options = {}) {
	const path = await import('node:path');
	const componentsDir =
		typeof options.componentsDir === 'string' && options.componentsDir.trim().length > 0
			? path.resolve(options.componentsDir)
			: null;

	if (!componentsDir) {
		throw new Error('discoverContentComponents requires a componentsDir');
	}

	const onError = options.onError ?? 'throw';
	if (onError !== 'throw' && onError !== 'warn') {
		throw new Error('discoverContentComponents onError must be "throw" or "warn"');
	}

	if (!(await pathExists(componentsDir))) {
		throw new Error(`Content components directory does not exist: ${componentsDir}`);
	}

	const fs = await import('node:fs/promises');
	const entries = (await fs.readdir(componentsDir, { withFileTypes: true })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
	const loadedComponents = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		try {
			loadedComponents.push(await loadContentComponent(path.join(componentsDir, entry.name)));
		} catch (error) {
			handleDiscoveryError(error, onError);
		}
	}

	return collectContentComponents(loadedComponents, { onError });
}

export function normalizeContentComponentInstance(component, input = {}) {
	const normalizedInput = input ?? {};
	const providedAttributes = normalizedInput.attributes ?? {};
	assertPlainObject(providedAttributes, 'content component input.attributes must be an object');

	const markdownLabel =
		normalizedInput.markdownLabel === undefined || normalizedInput.markdownLabel === null
			? null
			: typeof normalizedInput.markdownLabel === 'string'
				? normalizedInput.markdownLabel.trim()
				: (() => {
						throw new Error('content component input.markdownLabel must be a string');
					})();

	for (const attributeName of Object.keys(providedAttributes)) {
		if (!component.definition.attributes[attributeName]) {
			throw new Error(`Unknown content component attribute: ${attributeName}`);
		}
	}

	const attributes = {};

	for (const attributeName of Object.keys(component.definition.attributes).sort()) {
		const attributeDefinition = component.definition.attributes[attributeName];
		const providedValue = providedAttributes[attributeName];
		let nextValue =
			attributeDefinition.valueFromMarkdownLabel && markdownLabel !== null
				? markdownLabel
				: typeof providedValue === 'string'
					? providedValue.trim()
					: providedValue == null
						? undefined
						: (() => {
								throw new Error(`Content component attribute ${attributeName} must be a string`);
							})();

		if ((nextValue === undefined || nextValue.length === 0) && attributeDefinition.default !== undefined) {
			nextValue = attributeDefinition.default;
		}

		if (nextValue === undefined || nextValue.length === 0) {
			if (attributeDefinition.required) {
				throw new Error(`Content component attribute ${attributeName} is required`);
			}

			continue;
		}

		if (attributeDefinition.type === 'enum' && !attributeDefinition.options.includes(nextValue)) {
			throw new Error(
				`Content component attribute ${attributeName} must be one of: ${attributeDefinition.options.join(', ')}`
			);
		}

		attributes[attributeName] = nextValue;
	}

	return {
		componentId: component.definition.id,
		componentName: component.definition.name,
		kind: component.definition.kind,
		attributes
	};
}

export function renderContentComponent(component, instance, mode) {
	const template = getTemplateSource(component, mode);

	if (instance.componentId !== component.definition.id) {
		throw new Error(
			`Content component instance ${instance.componentId} does not match component ${component.definition.id}`
		);
	}

	try {
		return renderEnvironment.renderString(template.source, instance.attributes, {
			path: template.path
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to render ${mode} template for ${component.definition.name}: ${message}`);
	}
}
