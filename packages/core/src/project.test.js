import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkTentmanIds, doctorTentmanProject, loadTentmanProject } from './index.js';
import { serializeJson } from './json.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-project-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	return projectRoot;
}

test('loads the monorepo fixture app as a Tentman project', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.equal(project.rootConfig.siteName, 'Test App');
	assert.deepEqual(project.rootConfig.plugins, ['callout-chip']);
	assert.equal(project.configs.length, 5);
	assert.equal(project.blocksDir, 'tentman/blocks');
	assert.equal(project.blocks.length, 1);
	assert.equal(project.blocks[0]?.id, 'imageGallery');
	assert.equal(project.pluginsDir, 'tentman/plugins');
	assert.deepEqual(project.plugins, [
		{
			id: 'callout-chip',
			paths: ['tentman/plugins/callout-chip/plugin.js', 'tentman/plugins/callout-chip/plugin.mjs'],
			path: 'tentman/plugins/callout-chip/plugin.js',
			exists: true
		}
	]);
	assert.equal(project.navigationManifest.exists, true);
	assert.equal(project.navigationManifest.error, null);
});

test('doctors the fixture without manifest or path errors', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const diagnostics = await doctorTentmanProject(project);

	assert.deepEqual(diagnostics, []);
});

test('doctor accepts newer built-in block types', async () => {
	const projectRoot = await copyFixture();
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));

	blogConfig.blocks.push({ id: 'published', type: 'toggle', label: 'Published' });
	blogConfig.blocks.push({
		type: 'tentmanGroup',
		label: 'Group',
		collection: 'blog',
		addOption: true
	});
	await fs.writeFile(blogConfigPath, serializeJson(blogConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await doctorTentmanProject(project);

	assert.equal(
		diagnostics.filter((diagnostic) => diagnostic.code === 'blocks.unresolved').length,
		0
	);
});

test('reports the migrated fixture ids as clean', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const diagnostics = checkTentmanIds(project);

	assert.equal(diagnostics.filter((diagnostic) => diagnostic.code === 'id.missing').length, 0);
});

test('doctors missing reusable blocks, unresolved plugins, unsupported plugin surfaces, and missing asset directories', async () => {
	const projectRoot = await copyFixture();
	const aboutConfigPath = path.join(projectRoot, 'tentman/configs/about.tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blockConfigPath = path.join(projectRoot, 'tentman/blocks/image-gallery.tentman.json');
	const pluginPath = path.join(projectRoot, 'tentman/plugins/callout-chip/plugin.js');
	const rootConfigPath = path.join(projectRoot, '.tentman.json');

	const aboutConfig = JSON.parse(await fs.readFile(aboutConfigPath, 'utf8'));
	aboutConfig.blocks[4].type = 'missingGallery';
	await fs.writeFile(aboutConfigPath, serializeJson(aboutConfig));

	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.blocks[0].plugins = ['callout-chip'];
	blogConfig.blocks[4].assetsDir = '../../static/images/missing-posts';
	blogConfig.blocks[6].plugins = ['missing-plugin'];
	await fs.writeFile(blogConfigPath, serializeJson(blogConfig));

	const blockConfig = JSON.parse(await fs.readFile(blockConfigPath, 'utf8'));
	blockConfig.blocks[0].assetsDir = '../../static/images/missing-gallery';
	await fs.writeFile(blockConfigPath, serializeJson(blockConfig));

	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assetsDir = './static/missing-images';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	await fs.unlink(pluginPath);

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await doctorTentmanProject(project);

	assert.deepEqual(
		diagnostics.map((diagnostic) => diagnostic.code),
		[
			'blocks.unresolved',
			'plugin.missing',
			'plugin.unsupported-surface',
			'plugin.unresolved',
			'plugin.unregistered',
			'assets.missing-root-directory',
			'assets.missing-directory',
			'assets.missing-directory'
		]
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'blocks.unresolved')?.message ?? '',
		/About Page config references unknown reusable block type: missingGallery/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'plugin.missing')?.message ?? '',
		/Registered plugin callout-chip could not be resolved/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'plugin.unsupported-surface')?.message ?? '',
		/Blog Posts config enables plugins on non-markdown block title/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'plugin.unregistered')?.message ?? '',
		/Blog Posts config references unregistered plugin missing-plugin/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.missing-root-directory')?.message ?? '',
		/Configured assets directory does not exist: \.\/static\/missing-images/
	);
	assert.match(
		diagnostics.find(
			(diagnostic) =>
				diagnostic.code === 'assets.missing-directory' &&
				diagnostic.path === 'tentman/configs/blog.tentman.json'
		)?.message ?? '',
		/missing assets directory: static\/images\/missing-posts/
	);
	assert.match(
		diagnostics.find(
			(diagnostic) =>
				diagnostic.code === 'assets.missing-directory' &&
				diagnostic.path === 'tentman/blocks/image-gallery.tentman.json'
		)?.message ?? '',
		/missing assets directory: static\/images\/missing-gallery/
	);
});
