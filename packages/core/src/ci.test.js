import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadTentmanProject, runTentmanCi } from './index.js';
import { serializeJson } from './json.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-ci-'));
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
						referenceScope: 'container'
					}
				}
			})
		),
		fs.writeFile(path.join(componentDir, 'render.njk'), '<section>{{ data.title }}</section>\n'),
		fs.writeFile(path.join(componentDir, 'preview.njk'), '<section>{{ data.title }}</section>\n')
	]);
}

test('aggregates current non-writing checks for tentman ci', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const result = await runTentmanCi(project);

	assert.deepEqual(
		result.checks.map((check) => ({ id: check.id, errors: check.errors, warnings: check.warnings })),
		[
			{ id: 'doctor', errors: 0, warnings: 0 },
			{ id: 'ids', errors: 0, warnings: 0 },
			{ id: 'nav', errors: 0, warnings: 0 },
			{ id: 'format', errors: 8, warnings: 0 },
			{ id: 'assets', errors: 0, warnings: 0 }
		]
	);
	assert.deepEqual(result.summary, {
		errors: 8,
		warnings: 0,
		failedChecks: ['format'],
		checks: 5
	});
	assert.deepEqual(result.checks[3]?.summary, {
		files: 8,
		configs: 6,
		content: 2,
		navigationManifests: 0
	});
});

test('reports ci failures from doctor, ids, nav, and format together', async () => {
	const projectRoot = await copyFixture();
	const rootConfigPath = path.join(projectRoot, '.tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');

	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assetsDir = './static/missing-images';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig._tentmanId = 'legacy-blog';
	await fs.writeFile(blogConfigPath, serializeJson(blogConfig));

	const project = await loadTentmanProject(projectRoot);
	const result = await runTentmanCi(project);

	assert.equal(result.checks[0]?.id, 'doctor');
	assert.deepEqual(
		new Set(result.checks[0]?.diagnostics.map((diagnostic) => diagnostic.code)),
		new Set([
			'assets.missing-root-directory',
			'manifest.stale-config-reference',
			'manifest.stale-collection-reference'
		])
	);
	assert.deepEqual(
		result.checks[1]?.diagnostics.map((diagnostic) => diagnostic.code),
		['id.legacy']
	);
	assert.equal(result.checks[2]?.id, 'nav');
	assert.ok(result.checks[2]?.errors > 0);
	assert.ok(result.checks[3]?.summary.files > 0);
	assert.ok(result.checks[4]?.errors > 0);
	assert.deepEqual(new Set(result.summary.failedChecks), new Set(['doctor', 'nav', 'format', 'assets']));
	assert.equal(result.summary.warnings, 1);
	assert.equal(result.summary.checks, 5);
	assert.ok(result.summary.errors >= 6);
});

test('tentman ci fails doctor on invalid reference bindings', async () => {
	const projectRoot = await copyFixture();
	const projectsConfigPath = path.join(projectRoot, 'tentman/configs/projects.tentman.json');
	const projectsContentPath = path.join(projectRoot, 'src/content/pages/projects.json');
	const projectsConfig = JSON.parse(await fs.readFile(projectsConfigPath, 'utf8'));
	const projectsContent = JSON.parse(await fs.readFile(projectsContentPath, 'utf8'));
	await writeReferenceComponent(projectRoot);

	projectsConfig.blocks.push({
		id: 'galleries',
		type: 'block',
		label: 'Galleries',
		collection: true,
		blocks: [
			{
				id: 'referenceToken',
				type: 'text',
				label: 'Reference token',
				referenceFor: 'project-gallery:galleryRef'
			}
		]
	});
	projectsContent.galleries = [{ referenceToken: 'duplicate-token' }, { referenceToken: 'duplicate-token' }];

	await fs.writeFile(projectsConfigPath, serializeJson(projectsConfig));
	await fs.writeFile(projectsContentPath, serializeJson(projectsContent));

	const project = await loadTentmanProject(projectRoot);
	const result = await runTentmanCi(project);
	const doctorCheck = result.checks.find((check) => check.id === 'doctor');

	assert.ok(doctorCheck);
	assert.ok(
		doctorCheck?.diagnostics.some(
			(diagnostic) =>
				diagnostic.code === 'content-components.reference-binding.duplicate-token'
		)
	);
	assert.equal(doctorCheck?.errors, 0);
	assert.equal(doctorCheck?.warnings, 1);
});
