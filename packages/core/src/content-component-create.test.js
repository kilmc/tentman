import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	createContentComponentScaffold,
	loadContentComponent,
	normalizeContentComponentInstance,
	renderContentComponent,
	validateContentComponent
} from './index.js';
import { serializeJson } from './json.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture() {
	return copyTestAppToTempGitRepo('tentman-core-component-create-');
}

test('creates a valid content component scaffold in the default components directory', async () => {
	const projectRoot = await copyFixture();

	const created = await createContentComponentScaffold(projectRoot, 'buy-button');

	assert.deepEqual(created, {
		name: 'buy-button',
		kind: 'inline',
		directory: 'src/lib/content-components/buy-button',
		componentsDir: 'src/lib/content-components',
		files: [
			'src/lib/content-components/buy-button/component.json',
			'src/lib/content-components/buy-button/render.njk',
			'src/lib/content-components/buy-button/preview.njk'
		]
	});

	const component = validateContentComponent(
		await loadContentComponent(path.join(projectRoot, created.directory))
	);
	const instance = normalizeContentComponentInstance(component, {
		markdownLabel: 'Buy tickets'
	});

	assert.equal(renderContentComponent(component, instance, 'render').trim(), '<span class="content-component content-component--buy-button">Buy tickets</span>');
	assert.equal(
		renderContentComponent(component, instance, 'preview').trim(),
		'<span class="tm-component-preview tm-component-preview--buy-button">Buy tickets</span>'
	);
});

test('creates a valid content component scaffold in the configured components directory', async () => {
	const projectRoot = await copyFixture();
	const rootConfigPath = path.join(projectRoot, 'tentman.json');
	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.componentsDir = './src/lib/components/content';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const created = await createContentComponentScaffold(projectRoot, 'hero-callout');

	assert.equal(created.componentsDir, 'src/lib/components/content');
	assert.equal(created.directory, 'src/lib/components/content/hero-callout');
});

test('creates a valid block content component scaffold when requested', async () => {
	const projectRoot = await copyFixture();

	const created = await createContentComponentScaffold(projectRoot, 'image-gallery', {
		kind: 'block'
	});

	assert.equal(created.kind, 'block');

	const component = validateContentComponent(
		await loadContentComponent(path.join(projectRoot, created.directory))
	);
	const instance = normalizeContentComponentInstance(component, {
		markdownLabel: 'Gallery'
	});

	assert.equal(component.definition.kind, 'block');
	assert.equal(
		renderContentComponent(component, instance, 'render').trim(),
		'<div class="content-component content-component--image-gallery">Gallery</div>'
	);
	assert.equal(
		renderContentComponent(component, instance, 'preview').trim(),
		'<div class="tm-component-preview tm-component-preview--image-gallery">Gallery</div>'
	);
});

test('rejects invalid content component names', async () => {
	const projectRoot = await copyFixture();

	await assert.rejects(
		() => createContentComponentScaffold(projectRoot, 'BuyButton'),
		/content component name must be valid kebab-case using lowercase letters, numbers, and hyphens/i
	);
});

test('rejects invalid content component kinds', async () => {
	const projectRoot = await copyFixture();

	await assert.rejects(
		() => createContentComponentScaffold(projectRoot, 'buy-button', { kind: 'grid' }),
		/Content component kind must be "inline" or "block"/
	);
});

test('rejects creating a scaffold when the component directory already exists', async () => {
	const projectRoot = await copyFixture();

	await createContentComponentScaffold(projectRoot, 'buy-button');

	await assert.rejects(
		() => createContentComponentScaffold(projectRoot, 'buy-button'),
		/Content component directory already exists: src\/lib\/content-components\/buy-button/
	);
});
