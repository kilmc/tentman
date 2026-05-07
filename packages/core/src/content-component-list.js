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

export async function listTentmanContentComponents(project) {
	const componentsDirPath = resolveProjectPath(project.rootDir, project.componentsDir);

	if (!(await pathExists(componentsDirPath))) {
		return [];
	}

	const components = await discoverContentComponents({
		componentsDir: componentsDirPath
	});

	return components.map((component) => ({
		id: component.definition.id,
		name: component.definition.name,
		kind: component.definition.kind,
		path: toPosixPath(getPathRelativeToRoot(project.rootDir, component.directory)),
		attributeCount: Object.keys(component.definition.attributes).length,
		attributes: Object.keys(component.definition.attributes)
	}));
}
