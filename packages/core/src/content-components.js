// @ts-nocheck
import * as nunjucksModule from 'nunjucks';
import {
	assertPlainObject,
	parseJsonObject,
	readOptionalString,
	readRequiredString
} from './json.js';
export {
	inspectContentComponentPreviewTemplateSource,
	sanitizeContentComponentPreviewHtml
} from './content-component-preview-sanitizer.js';
export {
	inspectContentComponentPreviewCssSource,
	sanitizeContentComponentPreviewCss
} from './content-component-preview-css-sanitizer.js';

const COMPONENT_CONFIG_NAME = 'component.json';
const RENDER_TEMPLATE_NAME = 'render.njk';
const PREVIEW_TEMPLATE_NAME = 'preview.njk';
const PREVIEW_STYLESHEET_NAME = 'preview.css';
const VALID_COMPONENT_KINDS = new Set(['inline', 'block']);
const VALID_ATTRIBUTE_TYPES = new Set(['string', 'enum']);
const VALID_EDITOR_CONTROLS = new Set(['text', 'url', 'select']);
const VALID_REFERENCE_SCOPES = new Set(['self', 'container', 'full']);
const VALID_RENDER_MAPPING_ROOTS = new Set(['attributes', 'data']);
const nunjucksRuntime = nunjucksModule.Environment
	? nunjucksModule
	: nunjucksModule.default
		? nunjucksModule.default
		: globalThis.nunjucks;
const { Environment } = nunjucksRuntime;
const renderEnvironment = new Environment(undefined, {
	autoescape: true,
	throwOnUndefined: false
});

// Keep Node-only helpers out of browser bundle analysis. These code paths are only used when
// reading content component files from disk, never when rendering already-loaded components.
function importNodeModule(specifier) {
	return Function(`return import(${JSON.stringify(specifier)})`)();
}

async function pathExists(absolutePath) {
	const fs = await importNodeModule('node:fs/promises');

	try {
		await fs.access(absolutePath);
		return true;
	} catch {
		return false;
	}
}

async function readRequiredFile(filePath) {
	const fs = await importNodeModule('node:fs/promises');

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

function normalizeReferenceScopeValue(value, context) {
	if (typeof value !== 'string' || !VALID_REFERENCE_SCOPES.has(value)) {
		throw new Error(`${context} must be "self", "container", or "full"`);
	}

	return value;
}

function normalizeReferenceScope(input, context) {
	if (typeof input === 'string') {
		const scope = normalizeReferenceScopeValue(input, context);
		return {
			preview: scope,
			render: scope
		};
	}

	assertPlainObject(input, `${context} must be a string or an object`);
	return {
		preview: normalizeReferenceScopeValue(input.preview, `${context}.preview`),
		render: normalizeReferenceScopeValue(input.render, `${context}.render`)
	};
}

function normalizeRenderMappingPath(value, context) {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${context} must be a non-empty string`);
	}

	const normalizedValue = value.trim();
	const segments = normalizedValue.split('.');

	if (segments.length === 0 || !VALID_RENDER_MAPPING_ROOTS.has(segments[0])) {
		throw new Error(`${context} must start with "attributes." or "data."`);
	}

	for (const segment of segments.slice(1)) {
		if (!/^[A-Za-z0-9_]+$/.test(segment)) {
			throw new Error(`${context} contains an invalid path segment`);
		}
	}

	return normalizedValue;
}

function getPathValue(value, path) {
	const segments = path.split('.');
	let current = value;

	for (const segment of segments) {
		if (current === null || current === undefined || typeof current !== 'object') {
			return undefined;
		}

		current = current[segment];
	}

	return current;
}

function cloneReferenceValue(value) {
	if (value === null || value === undefined) {
		return value ?? null;
	}

	if (typeof structuredClone === 'function') {
		try {
			return structuredClone(value);
		} catch {
			// Browser-side preview data can arrive as reactive proxies that fail structuredClone.
			// Our content data is JSON-shaped, so falling back to JSON cloning keeps previews stable.
		}
	}

	return JSON.parse(JSON.stringify(value));
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

function normalizeAttributeDefinition(attributeName, input, context) {
	assertPlainObject(input, `${context}.${attributeName} must be an object`);

	const type = readRequiredString(input, 'type', `${context}.${attributeName}`);
	if (!VALID_ATTRIBUTE_TYPES.has(type)) {
		throw new Error(`${context}.${attributeName}.type must be "string" or "enum"`);
	}

	const reference = normalizeBooleanOption(
		input.reference,
		'reference',
		`${context}.${attributeName}`
	);
	if (reference === true && type !== 'string') {
		throw new Error(
			`${context}.${attributeName}.reference is only supported for string attributes`
		);
	}

	if (reference !== true && input.referenceScope !== undefined) {
		throw new Error(
			`${context}.${attributeName}.referenceScope is only supported when reference is true`
		);
	}

	const normalized = {
		type,
		required:
			normalizeBooleanOption(input.required, 'required', `${context}.${attributeName}`) === true,
		valueFromMarkdownLabel:
			normalizeBooleanOption(
				input.valueFromMarkdownLabel,
				'valueFromMarkdownLabel',
				`${context}.${attributeName}`
			) === true
	};

	if (reference === true) {
		if (input.referenceScope === undefined) {
			throw new Error(
				`${context}.${attributeName}.referenceScope is required when reference is true`
			);
		}

		normalized.reference = true;
		normalized.referenceScope = normalizeReferenceScope(
			input.referenceScope,
			`${context}.${attributeName}.referenceScope`
		);
	}

	if (input.editor !== undefined) {
		assertPlainObject(input.editor, `${context}.${attributeName}.editor must be an object`);
		const label = readOptionalString(input.editor, 'label', `${context}.${attributeName}.editor`);
		const control = readOptionalString(
			input.editor,
			'control',
			`${context}.${attributeName}.editor`
		);
		const hidden = normalizeBooleanOption(
			input.editor.hidden,
			'hidden',
			`${context}.${attributeName}.editor`
		);

		if (control !== undefined && !VALID_EDITOR_CONTROLS.has(control)) {
			throw new Error(
				`${context}.${attributeName}.editor.control must be "text", "url", or "select"`
			);
		}

		normalized.editor = {
			...(label !== undefined ? { label } : {}),
			...(control !== undefined ? { control } : {}),
			...(hidden !== undefined ? { hidden } : {})
		};
	}

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

function normalizeRenderConfig(renderInput, componentJsonPath) {
	if (renderInput === undefined) {
		return undefined;
	}

	assertPlainObject(renderInput, `${componentJsonPath}.render must be an object`);
	const targets = {};

	for (const [targetName, targetInput] of Object.entries(renderInput)) {
		assertPlainObject(targetInput, `${componentJsonPath}.render.${targetName} must be an object`);

		const from = readRequiredString(
			targetInput,
			'from',
			`${componentJsonPath}.render.${targetName}`
		);
		const component = readRequiredString(
			targetInput,
			'component',
			`${componentJsonPath}.render.${targetName}`
		);
		const propsInput = targetInput.props ?? {};
		assertPlainObject(
			propsInput,
			`${componentJsonPath}.render.${targetName}.props must be an object`
		);

		targets[targetName] = {
			from,
			component,
			props: Object.fromEntries(
				Object.entries(propsInput).map(([propName, mappingValue]) => [
					propName,
					normalizeRenderMappingPath(
						mappingValue,
						`${componentJsonPath}.render.${targetName}.props.${propName}`
					)
				])
			)
		};
	}

	return targets;
}

function normalizeDefinition(definition, componentJsonPath) {
	const kind = readOptionalString(definition, 'kind', componentJsonPath) ?? 'inline';
	if (!VALID_COMPONENT_KINDS.has(kind)) {
		throw new Error(`${componentJsonPath}.kind must be "inline" or "block"`);
	}

	const attributesInput = definition.attributes ?? {};
	assertPlainObject(attributesInput, `${componentJsonPath}.attributes must be an object`);
	const editorInput = definition.editor;

	const attributes = {};
	let markdownLabelAttributeCount = 0;
	let referenceAttributeCount = 0;

	for (const attributeName of Object.keys(attributesInput).sort()) {
		const attributeDefinition = normalizeAttributeDefinition(
			attributeName,
			attributesInput[attributeName],
			`${componentJsonPath}.attributes`
		);

		if (attributeDefinition.valueFromMarkdownLabel) {
			markdownLabelAttributeCount += 1;
		}

		if (attributeDefinition.reference === true) {
			referenceAttributeCount += 1;
		}

		attributes[attributeName] = attributeDefinition;
	}

	if (markdownLabelAttributeCount > 1) {
		throw new Error(
			`${componentJsonPath}.attributes may only declare one valueFromMarkdownLabel attribute`
		);
	}

	if (referenceAttributeCount > 1) {
		throw new Error(
			`${componentJsonPath}.attributes may only declare one reference attribute in v1`
		);
	}

	let editor;
	if (editorInput !== undefined) {
		assertPlainObject(editorInput, `${componentJsonPath}.editor must be an object`);
		const toolbarLabel = readOptionalString(
			editorInput,
			'toolbarLabel',
			`${componentJsonPath}.editor`
		);
		const dialogTitle = readOptionalString(
			editorInput,
			'dialogTitle',
			`${componentJsonPath}.editor`
		);
		const submitLabel = readOptionalString(
			editorInput,
			'submitLabel',
			`${componentJsonPath}.editor`
		);

		editor = {
			...(toolbarLabel !== undefined ? { toolbarLabel } : {}),
			...(dialogTitle !== undefined ? { dialogTitle } : {}),
			...(submitLabel !== undefined ? { submitLabel } : {})
		};
	}

	return {
		id: readRequiredString(definition, 'id', componentJsonPath),
		name: readRequiredString(definition, 'name', componentJsonPath),
		kind,
		attributes,
		...(editor ? { editor } : {}),
		...(definition.render !== undefined
			? { render: normalizeRenderConfig(definition.render, componentJsonPath) }
			: {})
	};
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
		if (acceptedIds.has(component.definition.id) || acceptedNames.has(component.definition.name)) {
			continue;
		}

		acceptedIds.add(component.definition.id);
		acceptedNames.add(component.definition.name);
		uniqueComponents.push(component);
	}

	return uniqueComponents;
}

function getReferenceBindings(value) {
	if (typeof value === 'string') {
		return value.trim().length > 0 ? [value.trim()] : [];
	}

	if (Array.isArray(value)) {
		return value
			.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
			.map((entry) => entry.trim());
	}

	return [];
}

export function parseContentComponentReferenceBinding(binding) {
	if (typeof binding !== 'string') {
		throw new Error('Content component reference binding must be a string');
	}

	const normalizedBinding = binding.trim();
	const separatorIndex = normalizedBinding.indexOf(':');

	if (separatorIndex === -1) {
		return {
			binding: normalizedBinding,
			componentId: normalizedBinding,
			attributeId: null,
			kind: 'marker'
		};
	}

	return {
		binding: normalizedBinding,
		componentId: normalizedBinding.slice(0, separatorIndex),
		attributeId: normalizedBinding.slice(separatorIndex + 1),
		kind: 'selector'
	};
}

function isPlainRecord(value) {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getBlockStorageKey(block) {
	if (!block || typeof block !== 'object' || typeof block.id !== 'string') {
		return null;
	}

	return block.id === 'tentmanGroup' ? '_tentmanGroup' : block.id;
}

function buildReferenceEntry({ binding, token, field, self, container, full }) {
	return {
		binding,
		token,
		field,
		self,
		container,
		full
	};
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
	const path = await importNodeModule('node:path');
	const normalizedDirectory = path.resolve(directory);
	const componentJsonPath = path.join(normalizedDirectory, COMPONENT_CONFIG_NAME);
	const renderTemplatePath = path.join(normalizedDirectory, RENDER_TEMPLATE_NAME);
	const previewTemplatePath = path.join(normalizedDirectory, PREVIEW_TEMPLATE_NAME);
	const previewCssPath = path.join(normalizedDirectory, PREVIEW_STYLESHEET_NAME);
	const hasPreviewCss = await pathExists(previewCssPath);

	const [componentJsonSource, renderTemplateSource, previewTemplateSource, previewCssSource] =
		await Promise.all([
			readRequiredFile(componentJsonPath),
			readRequiredFile(renderTemplatePath),
			readRequiredFile(previewTemplatePath),
			hasPreviewCss ? readRequiredFile(previewCssPath) : Promise.resolve(null)
		]);

	return {
		directory: normalizedDirectory,
		componentJsonPath,
		renderTemplatePath,
		previewTemplatePath,
		previewCssPath: hasPreviewCss ? previewCssPath : null,
		renderTemplateSource,
		previewTemplateSource,
		previewCssSource,
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

	if (
		typeof component.renderTemplatePath !== 'string' ||
		component.renderTemplatePath.length === 0
	) {
		throw new Error('content component.renderTemplatePath must be a non-empty string');
	}

	if (
		typeof component.previewTemplatePath !== 'string' ||
		component.previewTemplatePath.length === 0
	) {
		throw new Error('content component.previewTemplatePath must be a non-empty string');
	}

	if (component.previewCssPath !== null && component.previewCssPath !== undefined) {
		if (
			typeof component.previewCssPath !== 'string' ||
			component.previewCssPath.length === 0
		) {
			throw new Error('content component.previewCssPath must be null or a non-empty string');
		}
	}

	if (typeof component.renderTemplateSource !== 'string') {
		throw new Error(`${component.renderTemplatePath} must be loaded as a string`);
	}

	if (typeof component.previewTemplateSource !== 'string') {
		throw new Error(`${component.previewTemplatePath} must be loaded as a string`);
	}

	if (component.previewCssSource !== null && component.previewCssSource !== undefined) {
		if (typeof component.previewCssSource !== 'string') {
			throw new Error('content component.previewCssSource must be null or a string');
		}

		if (component.previewCssPath === null || component.previewCssPath === undefined) {
			throw new Error('content component.previewCssPath is required when previewCssSource is set');
		}
	}

	assertPlainObject(component.definition, `${componentJsonPath} must be an object`);

	return {
		...component,
		definition: normalizeDefinition(component.definition, componentJsonPath)
	};
}

export async function discoverContentComponents(options = {}) {
	const path = await importNodeModule('node:path');
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

	const fs = await importNodeModule('node:fs/promises');
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

		if (
			(nextValue === undefined || nextValue.length === 0) &&
			attributeDefinition.default !== undefined
		) {
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

export function getContentComponentReferenceAttribute(component) {
	for (const [attributeId, definition] of Object.entries(component.definition.attributes)) {
		if (definition.reference === true) {
			return {
				attributeId,
				definition,
				binding: `${component.definition.id}:${attributeId}`
			};
		}
	}

	return null;
}

export function getContentComponentReferenceScope(component, mode) {
	const referenceAttribute = getContentComponentReferenceAttribute(component);
	if (!referenceAttribute) {
		return null;
	}

	return referenceAttribute.definition.referenceScope?.[mode] ?? null;
}

export function getContentComponentRenderTarget(component, target) {
	return component.definition.render?.[target] ?? null;
}

export function collectContentComponentReferenceIndex(options) {
	const referenceIndex = new Map();
	const errors = [];

	function ensureBinding(binding) {
		const bindingIndex = referenceIndex.get(binding) ?? new Map();
		referenceIndex.set(binding, bindingIndex);
		return bindingIndex;
	}

	function register(binding, token, entry) {
		const bindingIndex = ensureBinding(binding);
		const existing = bindingIndex.get(token);

		if (existing) {
			errors.push(`Duplicate content reference token "${token}" found for binding "${binding}"`);
			return;
		}

		bindingIndex.set(token, entry);
		referenceIndex.set(binding, bindingIndex);
	}

	function walk(blocks, value, fullValue) {
		if (!isPlainRecord(value)) {
			return;
		}

		for (const block of blocks) {
			const storageKey = getBlockStorageKey(block);
			if (!storageKey) {
				continue;
			}

			const structuredBlocks = options.resolveStructuredBlocks(block);
			const fieldValue = value[storageKey];

			if (structuredBlocks) {
				const markerBindings = getReferenceBindings(block.referenceFor)
					.map(parseContentComponentReferenceBinding)
					.filter((binding) => binding.kind === 'marker');

				for (const binding of markerBindings) {
					ensureBinding(binding.binding);
				}

				if (block.collection) {
					if (!Array.isArray(fieldValue)) {
						continue;
					}

					for (const [index, item] of fieldValue.entries()) {
						if (isPlainRecord(item)) {
							for (const binding of markerBindings) {
								register(binding.binding, `${storageKey}[${index}]`, {
									binding: binding.binding,
									token: `${storageKey}[${index}]`,
									field: storageKey,
									self: item,
									container: item,
									full: fullValue
								});
							}
						}

						walk(structuredBlocks, item, fullValue);
					}

					continue;
				}

				if (isPlainRecord(fieldValue)) {
					for (const binding of markerBindings) {
						register(binding.binding, storageKey, {
							binding: binding.binding,
							token: storageKey,
							field: storageKey,
							self: fieldValue,
							container: fieldValue,
							full: fullValue
						});
					}
				}

				walk(structuredBlocks, fieldValue, fullValue);
				continue;
			}

			if (typeof fieldValue !== 'string') {
				continue;
			}

			const token = fieldValue.trim();
			if (token.length === 0) {
				continue;
			}

			for (const binding of getReferenceBindings(block.referenceFor).map(
				parseContentComponentReferenceBinding
			)) {
				ensureBinding(binding.binding);
				if (binding.kind !== 'selector') {
					continue;
				}

				register(
					binding.binding,
					token,
					buildReferenceEntry({
						binding: binding.binding,
						token,
						field: storageKey,
						self: token,
						container: value,
						full: fullValue
					})
				);
			}
		}
	}

	walk(options.blocks, options.contentItem, options.contentItem);

	return {
		referenceIndex,
		errors
	};
}

export function resolveContentComponentInstance(component, instance, mode, options = {}) {
	if (instance.componentId !== component.definition.id) {
		throw new Error(
			`Content component instance ${instance.componentId} does not match component ${component.definition.id}`
		);
	}

	const resolved = {
		attributes: instance.attributes,
		data: null
	};
	const referenceAttribute = getContentComponentReferenceAttribute(component);

	if (!referenceAttribute) {
		const markerBindingIndex = options.referenceIndex?.get(component.definition.id);
		if (!markerBindingIndex) {
			return resolved;
		}

		if (markerBindingIndex.size > 1) {
			throw new Error(
				`Content component reference "${component.definition.id}" is ambiguous because this entry has ${markerBindingIndex.size} bound sources`
			);
		}

		if (markerBindingIndex.size === 1) {
			resolved.data = Array.from(markerBindingIndex.values())[0]?.self ?? null;
		}

		return resolved;
	}

	const token = instance.attributes[referenceAttribute.attributeId];
	if (typeof token !== 'string' || token.trim().length === 0) {
		return resolved;
	}

	const match = options.referenceIndex?.get(referenceAttribute.binding)?.get(token.trim());
	if (!match) {
		return resolved;
	}

	const scope = referenceAttribute.definition.referenceScope?.[mode] ?? 'self';
	resolved.data =
		scope === 'self' ? match.self : scope === 'container' ? match.container : match.full;

	return resolved;
}

export function resolveContentComponentRenderTarget(component, instance, target, options = {}) {
	const renderTarget = getContentComponentRenderTarget(component, target);
	if (!renderTarget) {
		return null;
	}

	const resolvedInstance = resolveContentComponentInstance(component, instance, 'render', options);

	return {
		...renderTarget,
		props: Object.fromEntries(
			Object.entries(renderTarget.props).map(([propName, path]) => [
				propName,
				getPathValue(resolvedInstance, path)
			])
		)
	};
}

export function validateContentComponentInstance(component, instance, options = {}) {
	const errors = [];

	try {
		resolveContentComponentInstance(component, instance, 'preview', options);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : 'Invalid content component instance');
		return errors;
	}

	const referenceAttribute = getContentComponentReferenceAttribute(component);
	if (!referenceAttribute) {
		const markerBindingIndex = options.referenceIndex?.get(component.definition.id);
		if (!markerBindingIndex) {
			return errors;
		}

		if (markerBindingIndex.size === 0) {
			errors.push(
				`Content component reference "${component.definition.id}" could not resolve a bound source in this entry`
			);
		}

		return errors;
	}

	const token = instance.attributes[referenceAttribute.attributeId];
	if (typeof token !== 'string' || token.trim().length === 0) {
		if (referenceAttribute.definition.required) {
			errors.push(`Content component attribute ${referenceAttribute.attributeId} is required`);
		}

		return errors;
	}

	const resolvedInstance = resolveContentComponentInstance(component, instance, 'preview', options);
	if (resolvedInstance.data === null) {
		errors.push(
			`Content component reference "${referenceAttribute.binding}" could not resolve token "${token}"`
		);
	}

	return errors;
}

export function renderContentComponent(component, instance, mode, options = {}) {
	const template = getTemplateSource(component, mode);
	const resolvedInstance = resolveContentComponentInstance(component, instance, mode, options);

	try {
		return renderEnvironment.renderString(
			template.source,
			{
				...resolvedInstance.attributes,
				attributes: resolvedInstance.attributes,
				data: cloneReferenceValue(resolvedInstance.data)
			},
			{
				path: template.path
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to render ${mode} template for ${component.definition.name}: ${message}`
		);
	}
}
