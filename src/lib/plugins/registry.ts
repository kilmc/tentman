import type { BlockUsage, RootConfig } from '$lib/config/types';
import { loadJavaScriptModuleFromText } from '$lib/repository/local';
import type {
	LoadedMarkdownPlugins,
	LoadedSitePlugin,
	SitePluginRegistry,
	UnifiedLocalPlugin
} from '$lib/plugins/types';
import { createMarkdownPluginExtensions } from '$lib/plugins/markdown';

export interface PluginModuleSourceLoader {
	loadSource(path: string): Promise<string>;
}

const ENTRYPOINT_CANDIDATES = ['plugin.js', 'plugin.mjs'] as const;
const SUPPORTED_CAPABILITIES = new Set(['markdown', 'preview']);

function normalizeDir(dir: string | undefined): string {
	return dir?.replace(/^\.\//, '').replace(/\/+$/, '') ?? 'tentman/plugins';
}

function normalizePluginIds(pluginIds: string[] | undefined): string[] {
	return pluginIds?.filter((pluginId, index, values) => values.indexOf(pluginId) === index) ?? [];
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown plugin loading error';
}

function isUnifiedLocalPlugin(value: unknown): value is UnifiedLocalPlugin {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	const candidate = value as Partial<UnifiedLocalPlugin>;
	return (
		typeof candidate.id === 'string' &&
		candidate.id.length > 0 &&
		typeof candidate.version === 'string' &&
		Array.isArray(candidate.capabilities)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateFunction(value: unknown, path: string, errors: string[]) {
	if (typeof value !== 'function') {
		errors.push(`${path} must be a function`);
	}
}

function validateString(value: unknown, path: string, errors: string[]) {
	if (typeof value !== 'string' || value.length === 0) {
		errors.push(`${path} must be a non-empty string`);
	}
}

function validateUniqueString(value: unknown, path: string, seenValues: Set<string>, errors: string[]) {
	if (typeof value !== 'string' || value.length === 0) {
		validateString(value, path, errors);
		return;
	}

	if (seenValues.has(value)) {
		errors.push(`${path} duplicates "${value}"`);
		return;
	}

	seenValues.add(value);
}

function validateToolbarDialog(value: unknown, path: string, errors: string[]) {
	if (!isRecord(value)) {
		errors.push(`${path} must be an object`);
		return;
	}

	validateString(value.title, `${path}.title`, errors);
	validateFunction(value.submit, `${path}.submit`, errors);

	if (value.submitLabel !== undefined && typeof value.submitLabel !== 'string') {
		errors.push(`${path}.submitLabel must be a string`);
	}

	if (value.getInitialValues !== undefined && typeof value.getInitialValues !== 'function') {
		errors.push(`${path}.getInitialValues must be a function`);
	}

	if (value.validate !== undefined && typeof value.validate !== 'function') {
		errors.push(`${path}.validate must be a function`);
	}

	if (!Array.isArray(value.fields) || value.fields.length === 0) {
		errors.push(`${path}.fields must be a non-empty array`);
		return;
	}

	const fieldIds = new Set<string>();
	value.fields.forEach((field, index) => {
		const fieldPath = `${path}.fields[${index}]`;

		if (!isRecord(field)) {
			errors.push(`${fieldPath} must be an object`);
			return;
		}

		validateUniqueString(field.id, `${fieldPath}.id`, fieldIds, errors);
		validateString(field.label, `${fieldPath}.label`, errors);

		if (
			field.type !== undefined &&
			field.type !== 'text' &&
			field.type !== 'url' &&
			field.type !== 'select'
		) {
			errors.push(`${fieldPath}.type must be "text", "url", or "select"`);
		}

		if (field.type === 'select' && !Array.isArray(field.options)) {
			errors.push(`${fieldPath}.options must be an array for select fields`);
		}

		if (Array.isArray(field.options)) {
			const optionValues = new Set<string>();
			field.options.forEach((option, optionIndex) => {
				const optionPath = `${fieldPath}.options[${optionIndex}]`;

				if (!isRecord(option)) {
					errors.push(`${optionPath} must be an object`);
					return;
				}

				validateString(option.label, `${optionPath}.label`, errors);
				validateUniqueString(option.value, `${optionPath}.value`, optionValues, errors);
			});
		}
	});
}

function validateToolbarItem(value: unknown, path: string, errors: string[]) {
	if (!isRecord(value)) {
		errors.push(`${path} must be an object`);
		return;
	}

	validateString(value.id, `${path}.id`, errors);
	validateString(value.label, `${path}.label`, errors);

	if (value.buttonLabel !== undefined && typeof value.buttonLabel !== 'string') {
		errors.push(`${path}.buttonLabel must be a string`);
	}

	if (value.isActive !== undefined && typeof value.isActive !== 'function') {
		errors.push(`${path}.isActive must be a function`);
	}

	if (value.run !== undefined && typeof value.run !== 'function') {
		errors.push(`${path}.run must be a function`);
	}

	if (value.dialog !== undefined) {
		validateToolbarDialog(value.dialog, `${path}.dialog`, errors);
	}

	if (value.run === undefined && value.dialog === undefined) {
		errors.push(`${path} must define run or dialog`);
	}
}

function validateHtmlInlineNode(value: unknown, path: string, errors: string[]) {
	if (!isRecord(value)) {
		errors.push(`${path} must be an object`);
		return;
	}

	validateString(value.id, `${path}.id`, errors);
	validateString(value.nodeName, `${path}.nodeName`, errors);
	validateString(value.selector, `${path}.selector`, errors);
	validateFunction(value.renderHTML, `${path}.renderHTML`, errors);

	if (!Array.isArray(value.attributes)) {
		errors.push(`${path}.attributes must be an array`);
	} else {
		const attributeNames = new Set<string>();
		value.attributes.forEach((attribute, index) => {
			const attributePath = `${path}.attributes[${index}]`;

			if (!isRecord(attribute)) {
				errors.push(`${attributePath} must be an object`);
				return;
			}

			validateUniqueString(attribute.name, `${attributePath}.name`, attributeNames, errors);
			validateFunction(attribute.parse, `${attributePath}.parse`, errors);
		});
	}

	if (!isRecord(value.editorView)) {
		errors.push(`${path}.editorView must be an object`);
	} else {
		validateFunction(value.editorView.label, `${path}.editorView.label`, errors);

		if (
			value.editorView.className !== undefined &&
			typeof value.editorView.className !== 'string' &&
			typeof value.editorView.className !== 'function'
		) {
			errors.push(`${path}.editorView.className must be a string or function`);
		}
	}

	if (value.toolbarItems !== undefined) {
		if (!Array.isArray(value.toolbarItems)) {
			errors.push(`${path}.toolbarItems must be an array`);
		} else {
			const toolbarItemIds = new Set<string>();
			value.toolbarItems.forEach((item, index) => {
				const itemPath = `${path}.toolbarItems[${index}]`;

				validateToolbarItem(item, itemPath, errors);

				if (isRecord(item)) {
					validateUniqueString(item.id, `${itemPath}.id`, toolbarItemIds, errors);
				}
			});
		}
	}
}

function validateUnifiedLocalPluginShape(plugin: UnifiedLocalPlugin, pluginId: string, path: string) {
	const errors: string[] = [];
	const capabilityNames = new Set<string>();

	for (const capability of plugin.capabilities) {
		if (typeof capability !== 'string' || !SUPPORTED_CAPABILITIES.has(capability)) {
			errors.push(`capabilities includes unsupported value "${String(capability)}"`);
			continue;
		}

		if (capabilityNames.has(capability)) {
			errors.push(`capabilities includes duplicate value "${capability}"`);
		}

		capabilityNames.add(capability);
	}

	if (plugin.markdown !== undefined) {
		if (!capabilityNames.has('markdown')) {
			errors.push('markdown is defined, but "markdown" is missing from capabilities');
		}

		if (!isRecord(plugin.markdown)) {
			errors.push('markdown must be an object');
		} else if (plugin.markdown.htmlInlineNodes !== undefined) {
			if (!Array.isArray(plugin.markdown.htmlInlineNodes)) {
				errors.push('markdown.htmlInlineNodes must be an array');
			} else {
				const nodeIds = new Set<string>();
				const nodeNames = new Set<string>();
				plugin.markdown.htmlInlineNodes.forEach((node, index) => {
					const nodePath = `markdown.htmlInlineNodes[${index}]`;

					validateHtmlInlineNode(node, nodePath, errors);

					if (isRecord(node)) {
						validateUniqueString(node.id, `${nodePath}.id`, nodeIds, errors);
						validateUniqueString(node.nodeName, `${nodePath}.nodeName`, nodeNames, errors);
					}
				});
			}
		}
	}

	if (plugin.preview !== undefined) {
		if (!capabilityNames.has('preview')) {
			errors.push('preview is defined, but "preview" is missing from capabilities');
		}

		if (!isRecord(plugin.preview)) {
			errors.push('preview must be an object');
		} else if (
			plugin.preview.transformMarkdown !== undefined &&
			typeof plugin.preview.transformMarkdown !== 'function'
		) {
			errors.push('preview.transformMarkdown must be a function');
		}
	}

	if (errors.length > 0) {
		throw new Error(`Plugin "${pluginId}" at ${path} is invalid: ${errors.join('; ')}`);
	}
}

function createSitePluginRegistry(
	plugins: LoadedSitePlugin[],
	errors: string[] = []
): SitePluginRegistry {
	const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin]));

	return {
		plugins,
		errors,
		get(id: string) {
			return pluginsById.get(id);
		}
	};
}

export function resolveRegisteredPluginEntrypoints(rootConfig: RootConfig | null): Array<{
	id: string;
	path: string;
}> {
	const pluginsDir = normalizeDir(rootConfig?.pluginsDir);
	const pluginIds = normalizePluginIds(rootConfig?.plugins);

	return pluginIds.map((pluginId) => ({
		id: pluginId,
		path: `${pluginsDir}/${pluginId}`
	}));
}

async function loadPluginModule(
	sourceLoader: PluginModuleSourceLoader,
	pluginId: string,
	basePath: string
): Promise<LoadedSitePlugin> {
	const attemptedPaths: string[] = [];

	for (const entrypoint of ENTRYPOINT_CANDIDATES) {
		const path = `${basePath}/${entrypoint}`;
		attemptedPaths.push(path);

		try {
			const source = await sourceLoader.loadSource(path);
			const moduleValue = await loadJavaScriptModuleFromText(source, path);
			const pluginExport =
				moduleValue &&
				typeof moduleValue === 'object' &&
				'default' in moduleValue &&
				moduleValue.default !== undefined
					? moduleValue.default
					: moduleValue;

			if (!isUnifiedLocalPlugin(pluginExport)) {
				throw new Error(
					`Plugin "${pluginId}" at ${path} must export an object with id, version, and capabilities`
				);
			}

			if (pluginExport.id !== pluginId) {
				throw new Error(
					`Plugin "${pluginId}" at ${path} exported id "${pluginExport.id}", but it must match the registered plugin id`
				);
			}

			validateUnifiedLocalPluginShape(pluginExport, pluginId, path);

			return {
				id: pluginId,
				path,
				plugin: pluginExport
			};
		} catch (error) {
			const message = toErrorMessage(error);

			if (message.includes('Expected file at') || message.includes('404')) {
				continue;
			}

			if (message.includes('Failed to load plugin source at')) {
				continue;
			}

			throw error;
		}
	}

	throw new Error(
		`Plugin "${pluginId}" is missing an entrypoint. Tried: ${attemptedPaths.join(', ')}`
	);
}

export async function loadRegisteredPlugins(
	rootConfig: RootConfig | null,
	sourceLoader: PluginModuleSourceLoader
): Promise<LoadedSitePlugin[]> {
	const loadedPlugins = await Promise.all(
		resolveRegisteredPluginEntrypoints(rootConfig).map(({ id, path }) =>
			loadPluginModule(sourceLoader, id, path)
		)
	);
	const pluginsById = new Map<string, LoadedSitePlugin>();

	for (const loadedPlugin of loadedPlugins) {
		if (pluginsById.has(loadedPlugin.id)) {
			throw new Error(`Duplicate plugin id "${loadedPlugin.id}" in root.plugins`);
		}

		pluginsById.set(loadedPlugin.id, loadedPlugin);
	}

	return Array.from(pluginsById.values());
}

export async function loadPluginRegistry(
	rootConfig: RootConfig | null,
	sourceLoader: PluginModuleSourceLoader
): Promise<SitePluginRegistry> {
	const errors: string[] = [];
	const uniqueEntrypoints: Array<{ id: string; path: string }> = [];
	const seenPluginIds = new Set<string>();

	for (const entrypoint of resolveRegisteredPluginEntrypoints(rootConfig)) {
		if (seenPluginIds.has(entrypoint.id)) {
			errors.push(`Duplicate plugin id "${entrypoint.id}" in root.plugins`);
			continue;
		}

		seenPluginIds.add(entrypoint.id);
		uniqueEntrypoints.push(entrypoint);
	}

	const loadedPlugins = await Promise.all(
		uniqueEntrypoints.map(async ({ id, path }) => {
			try {
				return await loadPluginModule(sourceLoader, id, path);
			} catch (error) {
				errors.push(`Plugin "${id}" could not be loaded: ${toErrorMessage(error)}`);
				return null;
			}
		})
	);

	return createSitePluginRegistry(
		loadedPlugins.filter((plugin): plugin is LoadedSitePlugin => plugin !== null),
		errors
	);
}

export function selectMarkdownPluginsForField(
	field: Pick<BlockUsage, 'id' | 'type' | 'plugins'>,
	registry: SitePluginRegistry
): LoadedMarkdownPlugins {
	if (field.type !== 'markdown' || (field.plugins?.length ?? 0) === 0) {
		return {
			plugins: [],
			extensions: [],
			toolbarItems: [],
			errors: []
		};
	}

	const errors: string[] = [];
	const selectedPlugins: LoadedSitePlugin[] = [];

	for (const pluginId of normalizePluginIds(field.plugins)) {
		const plugin = registry.get(pluginId);

		if (!plugin) {
			const loadError = registry.errors.find((error) => error.includes(`"${pluginId}"`));

			errors.push(
				loadError
					? `Markdown field "${field.id}" could not load plugin "${pluginId}": ${loadError}`
					: `Markdown field "${field.id}" enables plugin "${pluginId}", but it is not registered in root.plugins`
			);
			continue;
		}

		selectedPlugins.push(plugin);
	}

	return {
		plugins: selectedPlugins,
		extensions: createMarkdownPluginExtensions(selectedPlugins.map((plugin) => plugin.plugin)),
		toolbarItems: selectedPlugins.flatMap((plugin) =>
			(plugin.plugin.markdown?.htmlInlineNodes ?? []).flatMap((node) => node.toolbarItems ?? [])
		),
		errors
	};
}

export async function loadMarkdownPluginsForField(
	field: Pick<BlockUsage, 'id' | 'type' | 'plugins'>,
	rootConfig: RootConfig | null,
	sourceLoader: PluginModuleSourceLoader
): Promise<LoadedMarkdownPlugins> {
	return selectMarkdownPluginsForField(field, await loadPluginRegistry(rootConfig, sourceLoader));
}

export function applyPreviewPluginTransforms(
	markdown: string,
	plugins: UnifiedLocalPlugin[]
): string {
	return plugins.reduce(
		(currentMarkdown, plugin) =>
			plugin.preview?.transformMarkdown
				? plugin.preview.transformMarkdown(currentMarkdown)
				: currentMarkdown,
		markdown
	);
}
