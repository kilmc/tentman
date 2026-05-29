import {
	collectContentComponents,
	type CoreLoadedContentComponent
} from '@tentman/core/content-components';
import type { RepoEntry, RepositoryBackend } from '$lib/repository/types';

const DEFAULT_COMPONENTS_DIR = 'src/lib/content-components';

interface LoadedContentComponentFileSet {
	directory: string;
	componentJsonPath: string;
	renderTemplatePath: string;
	previewTemplatePath: string;
	previewCssPath: string | null;
	renderTemplateSource: string;
	previewTemplateSource: string;
	previewCssSource: string | null;
	definition: unknown;
}

export interface ContentComponentRegistry {
	components: CoreLoadedContentComponent[];
	errors: string[];
	getByName(name: string): ContentComponentRegistry['components'][number] | undefined;
}

export function filterContentComponentRegistry(
	registry: ContentComponentRegistry,
	allowedComponentNames: string[] | undefined
): ContentComponentRegistry {
	if (!allowedComponentNames) {
		return registry;
	}

	if (allowedComponentNames.length === 0) {
		return {
			components: [],
			errors: registry.errors,
			getByName() {
				return undefined;
			}
		};
	}

	const allowedNames = new Set(allowedComponentNames);
	const components = registry.components.filter((component) =>
		allowedNames.has(component.definition.name)
	);

	return {
		components,
		errors: registry.errors,
		getByName(name: string) {
			return components.find((component) => component.definition.name === name);
		}
	};
}

function normalizeDirectoryPath(path: string | undefined): string {
	return path?.replace(/^\.\//, '').replace(/\/+$/, '') || DEFAULT_COMPONENTS_DIR;
}

function joinPath(...segments: string[]): string {
	return segments
		.filter(Boolean)
		.join('/')
		.replace(/\/{2,}/g, '/');
}

function isDirectory(entry: RepoEntry): boolean {
	return entry.kind === 'directory';
}

async function loadComponentFiles(
	backend: Pick<RepositoryBackend, 'readTextFile'>,
	directory: string
): Promise<LoadedContentComponentFileSet> {
	const componentJsonPath = joinPath(directory, 'component.json');
	const renderTemplatePath = joinPath(directory, 'render.njk');
	const previewTemplatePath = joinPath(directory, 'preview.njk');
	const [componentSource, renderTemplateSource, previewTemplateSource] = await Promise.all([
		backend.readTextFile(componentJsonPath),
		backend.readTextFile(renderTemplatePath),
		backend.readTextFile(previewTemplatePath)
	]);

	return {
		directory,
		componentJsonPath,
		renderTemplatePath,
		previewTemplatePath,
		previewCssPath: null,
		renderTemplateSource,
		previewTemplateSource,
		previewCssSource: null,
		definition: JSON.parse(componentSource)
	};
}

export async function loadContentComponentRegistryFromRepository(
	backend: Pick<RepositoryBackend, 'fileExists' | 'listDirectory' | 'readTextFile'>,
	options: {
		componentsDir?: string;
		onError?: 'throw' | 'warn';
	} = {}
): Promise<ContentComponentRegistry> {
	const onError = options.onError ?? 'throw';
	const componentsDir = normalizeDirectoryPath(options.componentsDir);
	const componentsDirExists = await backend.fileExists(componentsDir);

	if (!componentsDirExists) {
		return {
			components: [],
			errors: [],
			getByName() {
				return undefined;
			}
		};
	}

	const errors: string[] = [];
	const directories = (await backend.listDirectory(componentsDir))
		.filter(isDirectory)
		.sort((left, right) => left.path.localeCompare(right.path));
	const loadedComponents: LoadedContentComponentFileSet[] = [];

	for (const directory of directories) {
		try {
			loadedComponents.push(await loadComponentFiles(backend, directory.path));
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: `Failed to load content component at ${directory.path}`;

			if (onError === 'warn') {
				errors.push(message);
				continue;
			}

			throw error;
		}
	}

	try {
		const components = collectContentComponents(loadedComponents, {
			onError: onError === 'warn' ? 'warn' : 'throw'
		}) as ContentComponentRegistry['components'];

		return {
			components,
			errors,
			getByName(name: string) {
				return components.find((component) => component.definition.name === name);
			}
		};
	} catch (error) {
		if (onError === 'warn') {
			errors.push(error instanceof Error ? error.message : 'Failed to validate content components');
			return {
				components: [],
				errors,
				getByName() {
					return undefined;
				}
			};
		}

		throw error;
	}
}
