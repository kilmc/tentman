import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	createContentComponentScaffold,
	inspectTentmanContentComponent,
	loadTentmanProject
} from './index.js';
import { serializeJson } from './json.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture() {
	return copyTestAppToTempGitRepo('tentman-core-component-inspect-');
}

test('inspects a scaffolded content component by name', async () => {
	const projectRoot = await copyFixture();
	await createContentComponentScaffold(projectRoot, 'promo-banner');
	const project = await loadTentmanProject(projectRoot);

	const component = await inspectTentmanContentComponent(project, 'promo-banner');

	assert.equal(component.id, 'promo-banner');
	assert.equal(component.name, 'promo-banner');
	assert.equal(component.kind, 'inline');
	assert.equal(component.path, 'src/lib/content-components/promo-banner');
	assert.equal(
		component.componentJsonPath,
		'src/lib/content-components/promo-banner/component.json'
	);
	assert.equal(component.renderTemplatePath, 'src/lib/content-components/promo-banner/render.njk');
	assert.equal(
		component.previewTemplatePath,
		'src/lib/content-components/promo-banner/preview.njk'
	);
	assert.deepEqual(component.previewTemplateWarnings, []);
	assert.deepEqual(component.attributes, {
		label: {
			type: 'string',
			required: true,
			valueFromMarkdownLabel: true
		}
	});
});

test('inspects a scaffolded content component by id from a configured directory', async () => {
	const projectRoot = await copyFixture();
	const rootConfigPath = path.join(projectRoot, 'tentman.json');
	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.componentsDir = './src/lib/components/content';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));
	await createContentComponentScaffold(projectRoot, 'hero-callout', { kind: 'block' });
	const project = await loadTentmanProject(projectRoot);

	const component = await inspectTentmanContentComponent(project, 'hero-callout');

	assert.equal(component.kind, 'block');
	assert.equal(component.path, 'src/lib/components/content/hero-callout');
});

test('includes preview sanitization warnings in component inspection', async () => {
	const projectRoot = await copyFixture();
	await createContentComponentScaffold(projectRoot, 'promo-banner');
	await fs.writeFile(
		path.join(projectRoot, 'src/lib/content-components/promo-banner/preview.njk'),
		'<span style="color: red">Promo</span>\n'
	);
	const project = await loadTentmanProject(projectRoot);

	const component = await inspectTentmanContentComponent(project, 'promo-banner');

	assert.deepEqual(component.previewTemplateWarnings, [
		'Stripped unsupported style attribute from <span>'
	]);
});

test('throws when inspecting an unknown content component', async () => {
	const projectRoot = await copyFixture();
	await fs.rm(path.join(projectRoot, 'src/lib/content-components'), {
		recursive: true,
		force: true
	});
	const project = await loadTentmanProject(projectRoot);

	await assert.rejects(
		() => inspectTentmanContentComponent(project, 'missing-widget'),
		/No content components directory found at src\/lib\/content-components/
	);
});

test('throws when a requested content component does not exist in an existing directory', async () => {
	const projectRoot = await copyFixture();
	await createContentComponentScaffold(projectRoot, 'promo-banner');
	const project = await loadTentmanProject(projectRoot);

	await assert.rejects(
		() => inspectTentmanContentComponent(project, 'missing-widget'),
		/Unknown content component: missing-widget/
	);
});
