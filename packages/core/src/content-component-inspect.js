import { discoverContentComponents } from './content-components.js';
import { getPathRelativeToRoot, resolveProjectPath, toPosixPath } from './paths.js';

async function pathExists(candidatePath) {
	const fs = await import('node:fs/promises');

	try {
		await fs.access(candidatePath);
		return true;
	} catch {
		return false;
	}
}

export async function inspectTentmanContentComponent(project, reference) {
	if (typeof reference !== 'string' || reference.trim().length === 0) {
		throw new Error('Content component reference is required');
	}

	const normalizedReference = reference.trim();
	const componentsDirPath = resolveProjectPath(project.rootDir, project.componentsDir);

	if (!(await pathExists(componentsDirPath))) {
		throw new Error(`No content components directory found at ${project.componentsDir}`);
	}

	const components = await discoverContentComponents({
		componentsDir: componentsDirPath
	});
	const component = components.find(
		(candidate) =>
			candidate.definition.id === normalizedReference ||
			candidate.definition.name === normalizedReference
	);

	if (!component) {
		throw new Error(`Unknown content component: ${normalizedReference}`);
	}

	return {
		id: component.definition.id,
		name: component.definition.name,
		kind: component.definition.kind,
		path: toPosixPath(getPathRelativeToRoot(project.rootDir, component.directory)),
		componentJsonPath: toPosixPath(
			getPathRelativeToRoot(project.rootDir, component.componentJsonPath)
		),
		renderTemplatePath: toPosixPath(
			getPathRelativeToRoot(project.rootDir, component.renderTemplatePath)
		),
		previewTemplatePath: toPosixPath(
			getPathRelativeToRoot(project.rootDir, component.previewTemplatePath)
		),
		attributes: component.definition.attributes
	};
}
