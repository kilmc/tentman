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

async function writeReferenceComponent(projectRoot) {
	const componentDir = path.join(projectRoot, 'src/lib/content-components/project-gallery');
	await fs.mkdir(componentDir, { recursive: true });
	await Promise.all([
		fs.writeFile(
			path.join(componentDir, 'component.json'),
			serializeJson({
				id: 'project-gallery',
				name: 'project-gallery',
				kind: 'block',
				attributes: {
					galleryRef: {
						type: 'string',
						required: true,
						reference: true,
						referenceScope: 'full'
					}
				}
			})
		),
		fs.writeFile(path.join(componentDir, 'render.njk'), '<section>{{ data.gallery.title }}</section>\n'),
		fs.writeFile(path.join(componentDir, 'preview.njk'), '<section>{{ data.gallery.title }}</section>\n')
	]);
}

test('loads the monorepo fixture app as a Tentman project', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.equal(project.rootConfig.siteName, 'Test App');
	assert.equal(project.configs.length, 6);
	assert.equal(project.blocksDir, 'tentman/blocks');
	assert.equal(project.blocks.length, 1);
	assert.equal(project.blocks[0]?.id, 'imageGallery');
	assert.equal(project.componentsDir, 'src/lib/content-components');
	assert.equal(project.navigationManifest.exists, true);
	assert.equal(project.navigationManifest.error, null);
});

test('loads configured content components directory from root config', async () => {
	const projectRoot = await copyFixture();
	const rootConfigPath = path.join(projectRoot, '.tentman.json');
	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.componentsDir = './src/lib/components/content';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const project = await loadTentmanProject(projectRoot);

	assert.equal(project.rootConfig.componentsDir, './src/lib/components/content');
	assert.equal(project.componentsDir, 'src/lib/components/content');
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

test('doctors missing reusable blocks and missing asset directories', async () => {
	const projectRoot = await copyFixture();
	const aboutConfigPath = path.join(projectRoot, 'tentman/configs/about.tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blockConfigPath = path.join(projectRoot, 'tentman/blocks/image-gallery.tentman.json');
	const rootConfigPath = path.join(projectRoot, '.tentman.json');

	const aboutConfig = JSON.parse(await fs.readFile(aboutConfigPath, 'utf8'));
	aboutConfig.blocks[4].type = 'missingGallery';
	await fs.writeFile(aboutConfigPath, serializeJson(aboutConfig));

	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.blocks[4].assetsDir = '../../static/images/missing-posts';
	await fs.writeFile(blogConfigPath, serializeJson(blogConfig));

	const blockConfig = JSON.parse(await fs.readFile(blockConfigPath, 'utf8'));
	blockConfig.blocks[0].assetsDir = '../../static/images/missing-gallery';
	await fs.writeFile(blockConfigPath, serializeJson(blockConfig));

	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assetsDir = './static/missing-images';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await doctorTentmanProject(project);

	assert.deepEqual(
		diagnostics.map((diagnostic) => diagnostic.code),
		[
			'blocks.unresolved',
			'assets.missing-root-directory',
			'assets.missing-directory',
			'assets.missing-directory'
		]
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'blocks.unresolved')?.message ?? '',
		/About config references unknown reusable block type: missingGallery/
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

test('doctor reports invalid content component reference bindings as hard errors', async () => {
	const projectRoot = await copyFixture();
	const projectsConfigPath = path.join(projectRoot, 'tentman/configs/projects.tentman.json');
	const projectsConfig = JSON.parse(await fs.readFile(projectsConfigPath, 'utf8'));
	await writeReferenceComponent(projectRoot);

	projectsConfig.blocks.push({
		id: 'gallery',
		type: 'block',
		label: 'Gallery',
		blocks: [
			{
				id: 'referenceToken',
				type: 'text',
				label: 'Reference token',
				referenceFor: 'project-gallery:missingRef'
			}
		]
	});
	await fs.writeFile(projectsConfigPath, serializeJson(projectsConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await doctorTentmanProject(project);

	assert.deepEqual(
		diagnostics
			.filter((diagnostic) => diagnostic.code.startsWith('content-components.reference-binding'))
			.map((diagnostic) => diagnostic.code),
		['content-components.reference-binding.missing-attribute']
	);
	assert.match(
		diagnostics.find((diagnostic) =>
			diagnostic.code === 'content-components.reference-binding.missing-attribute'
		)?.message ?? '',
		/content component "project-gallery" has no "missingRef" attribute/
	);
});
