import fs from 'node:fs/promises';
import path from 'node:path';
import {
	loadContentComponent,
	normalizeContentComponentInstance,
	renderContentComponent,
	validateContentComponent
} from './content-components.js';
import { serializeJson } from './json.js';
import { ROOT_CONFIG_PATH, parseRootConfig } from './project.js';
import { getPathRelativeToRoot, resolveProjectPath, toPosixPath } from './paths.js';

const DEFAULT_COMPONENTS_DIR = 'src/lib/content-components';
const VALID_COMPONENT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_COMPONENT_KINDS = new Set(['inline', 'block']);

function validateComponentName(name) {
	if (typeof name !== 'string' || name.trim().length === 0) {
		throw new Error('Content component name is required');
	}

	const trimmedName = name.trim();
	if (!VALID_COMPONENT_NAME_PATTERN.test(trimmedName)) {
		throw new Error(
			'Content component name must be valid kebab-case using lowercase letters, numbers, and hyphens'
		);
	}

	return trimmedName;
}

async function pathExists(candidatePath) {
	try {
		await fs.access(candidatePath);
		return true;
	} catch {
		return false;
	}
}

function validateComponentKind(kind) {
	if (kind === undefined) {
		return 'inline';
	}

	if (typeof kind !== 'string' || !VALID_COMPONENT_KINDS.has(kind)) {
		throw new Error('Content component kind must be "inline" or "block"');
	}

	return kind;
}

function getScaffoldDefinition(name, kind) {
	return {
		id: name,
		name,
		kind,
		attributes: {
			label: {
				type: 'string',
				required: true,
				valueFromMarkdownLabel: true
			}
		}
	};
}

function getRenderTemplateSource(name, kind) {
	if (kind === 'block') {
		return `<div class="content-component content-component--${name}">{{ label }}</div>\n`;
	}

	return `<span class="content-component content-component--${name}">{{ label }}</span>\n`;
}

function getPreviewTemplateSource(name, kind) {
	if (kind === 'block') {
		return `<div class="tm-component-preview tm-component-preview--${name}">{{ label }}</div>\n`;
	}

	return `<span class="tm-component-preview tm-component-preview--${name}">{{ label }}</span>\n`;
}

export async function createContentComponentScaffold(projectRoot, name, options = {}) {
	const rootDir = path.resolve(projectRoot);
	const normalizedName = validateComponentName(name);
	const normalizedKind = validateComponentKind(options.kind);
	const rootConfigPath = resolveProjectPath(rootDir, ROOT_CONFIG_PATH);
	const rootConfigSource = await fs.readFile(rootConfigPath, 'utf8');
	const rootConfig = parseRootConfig(rootConfigSource);
	const componentsDir = rootConfig.componentsDir ?? `./${DEFAULT_COMPONENTS_DIR}`;
	const componentsDirPath = resolveProjectPath(rootDir, componentsDir);
	const componentDirPath = path.join(componentsDirPath, normalizedName);

	if (await pathExists(componentDirPath)) {
		throw new Error(
			`Content component directory already exists: ${getPathRelativeToRoot(rootDir, componentDirPath)}`
		);
	}

	await fs.mkdir(componentDirPath, { recursive: true });

	const componentJsonPath = path.join(componentDirPath, 'component.json');
	const renderTemplatePath = path.join(componentDirPath, 'render.njk');
	const previewTemplatePath = path.join(componentDirPath, 'preview.njk');

	await Promise.all([
		fs.writeFile(componentJsonPath, serializeJson(getScaffoldDefinition(normalizedName, normalizedKind))),
		fs.writeFile(renderTemplatePath, getRenderTemplateSource(normalizedName, normalizedKind)),
		fs.writeFile(previewTemplatePath, getPreviewTemplateSource(normalizedName, normalizedKind))
	]);

	const loadedComponent = validateContentComponent(await loadContentComponent(componentDirPath));
	const instance = normalizeContentComponentInstance(loadedComponent, {
		markdownLabel: 'Example label'
	});
	renderContentComponent(loadedComponent, instance, 'render');
	renderContentComponent(loadedComponent, instance, 'preview');

	return {
		name: normalizedName,
		kind: normalizedKind,
		directory: toPosixPath(getPathRelativeToRoot(rootDir, componentDirPath)),
		componentsDir: toPosixPath(getPathRelativeToRoot(rootDir, componentsDirPath)),
		files: [
			toPosixPath(getPathRelativeToRoot(rootDir, componentJsonPath)),
			toPosixPath(getPathRelativeToRoot(rootDir, renderTemplatePath)),
			toPosixPath(getPathRelativeToRoot(rootDir, previewTemplatePath))
		]
	};
}
