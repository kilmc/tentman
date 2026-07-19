import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { loadTentmanProject, runTentmanCi } from './index.js';
import { serializeJson } from './json.js';
import {
	copyCoreFixtureProjectToTempGitRepo,
	loadCoreFixtureProject
} from './test-paths.test-helper.js';

async function copyFixture(t) {
	return copyCoreFixtureProjectToTempGitRepo(t, 'tentman-core-ci-');
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
		fs.writeFile(path.join(componentDir, 'render.njk'), '<section>{{ data.title }}</section>\n')
	]);
}

test('aggregates current non-writing checks for tentman ci', async () => {
	const project = await loadCoreFixtureProject();
	const result = await runTentmanCi(project);

	assert.deepEqual(
		result.checks.map((check) => ({ id: check.id, errors: check.errors, warnings: check.warnings })),
		[
			{ id: 'doctor', errors: 0, warnings: 0 },
			{ id: 'ids', errors: 0, warnings: 0 },
			{ id: 'nav', errors: 0, warnings: 0 },
			{ id: 'format', errors: 0, warnings: 0 },
			{ id: 'assets', errors: 0, warnings: 0 }
		]
	);
	assert.deepEqual(result.summary, {
		errors: 0,
		warnings: 0,
		failedChecks: [],
		checks: 5
	});
	assert.deepEqual(result.checks[3]?.summary, {
		files: 0,
		configs: 0,
		content: 0,
		navigationManifests: 0
	});
});

test('reports ci failures from doctor, ids, nav, and format together', async (t) => {
	const projectRoot = await copyFixture(t);
	const rootConfigPath = path.join(projectRoot, 'tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');

	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assetsDir = './static/missing-images';
	rootConfig.assets.path = './static/missing-images';
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
			'assets.legacy-assets-dir',
			'assets.missing-directory',
			'manifest.stale-config-reference'
		])
	);
	assert.deepEqual(
		result.checks[1]?.diagnostics.map((diagnostic) => diagnostic.code),
		['id.legacy']
	);
	assert.equal(result.checks[2]?.id, 'nav');
	assert.ok(result.checks[2]?.errors > 0);
	assert.equal(result.checks[3]?.summary.files, 0);
	assert.ok(result.checks[4]?.errors > 0);
	assert.deepEqual(new Set(result.summary.failedChecks), new Set(['doctor', 'nav', 'assets']));
	assert.equal(result.summary.warnings, 5);
	assert.equal(result.summary.checks, 5);
	assert.ok(result.summary.errors >= 6);
});

test('tentman ci fails doctor on invalid reference bindings', async (t) => {
	const projectRoot = await copyFixture(t);
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
