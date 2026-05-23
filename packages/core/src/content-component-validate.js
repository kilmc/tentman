import {
	collectContentComponents,
	inspectContentComponentPreviewCssSource,
	inspectContentComponentPreviewTemplateSource,
	loadContentComponent,
	validateContentComponent
} from './content-components.js';
import { resolveProjectPath } from './paths.js';

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

async function pathExists(candidatePath) {
	const fs = await import('node:fs/promises');

	try {
		await fs.access(candidatePath);
		return true;
	} catch {
		return false;
	}
}

export async function validateTentmanContentComponents(project) {
	const componentsDirPath = resolveProjectPath(project.rootDir, project.componentsDir);

	if (!(await pathExists(componentsDirPath))) {
		return [];
	}

	const fs = await import('node:fs/promises');
	const path = await import('node:path');
	const entries = (await fs.readdir(componentsDirPath, { withFileTypes: true })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
	const diagnostics = [];
	const loadedComponents = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		const componentDirPath = path.join(componentsDirPath, entry.name);

		try {
			const component = validateContentComponent(await loadContentComponent(componentDirPath));
			loadedComponents.push(component);
			const previewInspection = inspectContentComponentPreviewTemplateSource(
				component.previewTemplateSource
			);
			for (const diagnostic of previewInspection.diagnostics) {
				diagnostics.push(
					createDiagnostic('warning', 'component.preview-unsafe-html', diagnostic.message, {
						path: component.previewTemplatePath
					})
				);
			}
			if (component.previewCssSource) {
				const previewCssInspection = inspectContentComponentPreviewCssSource(
					component.previewCssSource
				);
				for (const diagnostic of previewCssInspection.diagnostics) {
					diagnostics.push(
						createDiagnostic('warning', 'component.preview-unsafe-css', diagnostic.message, {
							path: component.previewCssPath
						})
					);
				}
			}
		} catch (error) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'component.invalid',
					error instanceof Error ? error.message : 'Failed to load content component',
					{
						path: `${project.componentsDir}/${entry.name}`
					}
				)
			);
		}
	}

	try {
		collectContentComponents(loadedComponents);
	} catch (error) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'component.registry-invalid',
				error instanceof Error ? error.message : 'Failed to validate content component registry',
				{ path: project.componentsDir }
			)
		);
	}

	return diagnostics;
}
