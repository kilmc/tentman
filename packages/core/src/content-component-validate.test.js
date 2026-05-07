import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	createContentComponentScaffold,
	loadTentmanProject,
	validateTentmanContentComponents
} from './index.js';
import { serializeJson } from './json.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-component-validate-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	return projectRoot;
}

test('returns no diagnostics when the project components directory does not exist yet', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);

	assert.deepEqual(await validateTentmanContentComponents(project), []);
});

test('returns no diagnostics for valid scaffolded content components', async () => {
	const projectRoot = await copyFixture();
	await createContentComponentScaffold(projectRoot, 'promo-banner');
	await createContentComponentScaffold(projectRoot, 'image-gallery', { kind: 'block' });
	const project = await loadTentmanProject(projectRoot);

	assert.deepEqual(await validateTentmanContentComponents(project), []);
});

test('reports invalid content component files', async () => {
	const projectRoot = await copyFixture();
	const componentDir = path.join(projectRoot, 'src/lib/content-components/broken-widget');
	await fs.mkdir(componentDir, { recursive: true });
	await fs.writeFile(
		path.join(componentDir, 'component.json'),
		serializeJson({
			id: 'broken-widget',
			name: 'broken-widget',
			kind: 'inline',
			attributes: {}
		})
	);
	await fs.writeFile(path.join(componentDir, 'render.njk'), '<span>{{ label }}</span>\n');
	const project = await loadTentmanProject(projectRoot);

	const diagnostics = await validateTentmanContentComponents(project);

	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, 'component.invalid');
	assert.match(diagnostics[0].message, /Missing required content component file: .*preview\.njk/);
	assert.equal(diagnostics[0].path, 'src/lib/content-components/broken-widget');
});

test('reports duplicate ids across discovered content components', async () => {
	const projectRoot = await copyFixture();
	await createContentComponentScaffold(projectRoot, 'promo-banner');
	await createContentComponentScaffold(projectRoot, 'hero-banner');

	const duplicatePath = path.join(
		projectRoot,
		'src/lib/content-components/hero-banner/component.json'
	);
	const duplicateConfig = JSON.parse(await fs.readFile(duplicatePath, 'utf8'));
	duplicateConfig.id = 'promo-banner';
	await fs.writeFile(duplicatePath, serializeJson(duplicateConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await validateTentmanContentComponents(project);

	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, 'component.registry-invalid');
	assert.match(diagnostics[0].message, /Duplicate content component ids found: promo-banner/);
	assert.equal(diagnostics[0].path, 'src/lib/content-components');
});
