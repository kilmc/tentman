import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContentComponentScaffold, listTentmanContentComponents, loadTentmanProject } from './index.js';
import { serializeJson } from './json.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-component-list-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	return projectRoot;
}

test('lists no content components when the project components directory does not exist yet', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);

	assert.deepEqual(await listTentmanContentComponents(project), []);
});

test('lists scaffolded content components from the default components directory', async () => {
	const projectRoot = await copyFixture();
	await createContentComponentScaffold(projectRoot, 'buy-button');
	await createContentComponentScaffold(projectRoot, 'image-gallery', { kind: 'block' });

	const project = await loadTentmanProject(projectRoot);
	const components = await listTentmanContentComponents(project);

	assert.deepEqual(
		components.map((component) => ({
			id: component.id,
			name: component.name,
			kind: component.kind,
			attributeCount: component.attributeCount,
			attributes: component.attributes
		})),
		[
			{
				id: 'buy-button',
				name: 'buy-button',
				kind: 'inline',
				attributeCount: 1,
				attributes: ['label']
			},
			{
				id: 'image-gallery',
				name: 'image-gallery',
				kind: 'block',
				attributeCount: 1,
				attributes: ['label']
			}
		]
	);
});

test('lists scaffolded content components from the configured components directory', async () => {
	const projectRoot = await copyFixture();
	const rootConfigPath = path.join(projectRoot, '.tentman.json');
	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.componentsDir = './src/lib/components/content';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));
	await createContentComponentScaffold(projectRoot, 'hero-callout');

	const project = await loadTentmanProject(projectRoot);
	const components = await listTentmanContentComponents(project);

	assert.equal(components.length, 1);
	assert.equal(components[0].path, 'src/lib/components/content/hero-callout');
});
