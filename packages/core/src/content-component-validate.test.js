import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	createContentComponentScaffold,
	loadTentmanProject,
	validateTentmanContentComponents
} from './index.js';
import { serializeJson } from './json.js';
import {
	copyCoreFixtureProjectToTempGitRepo,
	loadCoreFixtureProject
} from './test-paths.test-helper.js';

async function copyFixture(t) {
	return copyCoreFixtureProjectToTempGitRepo(t, 'tentman-core-component-validate-');
}

test('returns no diagnostics when the project components directory does not exist yet', async () => {
	const project = await loadCoreFixtureProject();

	assert.deepEqual(await validateTentmanContentComponents(project), []);
});

test('returns no diagnostics for valid scaffolded content components', async (t) => {
	const projectRoot = await copyFixture(t);
	await createContentComponentScaffold(projectRoot, 'promo-banner');
	await createContentComponentScaffold(projectRoot, 'image-gallery', { kind: 'block' });
	const project = await loadTentmanProject(projectRoot);

	assert.deepEqual(await validateTentmanContentComponents(project), []);
});

test('reports invalid content component files', async (t) => {
	const projectRoot = await copyFixture(t);
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
	const project = await loadTentmanProject(projectRoot);

	const diagnostics = await validateTentmanContentComponents(project);

	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, 'component.invalid');
	assert.match(diagnostics[0].message, /Missing required content component file: .*render\.njk/);
	assert.equal(diagnostics[0].path, 'src/lib/content-components/broken-widget');
});

test('reports duplicate ids across discovered content components', async (t) => {
	const projectRoot = await copyFixture(t);
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
