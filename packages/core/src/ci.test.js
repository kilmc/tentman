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

test('aggregates current non-writing checks for tentman ci', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const result = await runTentmanCi(project);

	assert.deepEqual(
		result.checks.map((check) => ({ id: check.id, errors: check.errors, warnings: check.warnings })),
		[
			{ id: 'doctor', errors: 0, warnings: 0 },
			{ id: 'ids', errors: 0, warnings: 0 },
			{ id: 'nav', errors: 0, warnings: 0 },
			{ id: 'format', errors: 6, warnings: 0 },
			{ id: 'assets', errors: 0, warnings: 0 }
		]
	);
	assert.deepEqual(result.summary, {
		errors: 6,
		warnings: 0,
		failedChecks: ['format'],
		checks: 5
	});
	assert.deepEqual(result.checks[3]?.summary, {
		files: 6,
		configs: 5,
		content: 1,
		navigationManifests: 0
	});
});

test('reports ci failures from doctor, ids, nav, and format together', async () => {
	const projectRoot = await copyFixture();
	const rootConfigPath = path.join(projectRoot, '.tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const pluginPath = path.join(projectRoot, 'tentman/plugins/callout-chip/plugin.js');

	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assetsDir = './static/missing-images';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig._tentmanId = 'legacy-blog';
	await fs.writeFile(blogConfigPath, serializeJson(blogConfig));

	await fs.unlink(pluginPath);

	const project = await loadTentmanProject(projectRoot);
	const result = await runTentmanCi(project);

	assert.equal(result.checks[0]?.id, 'doctor');
	assert.deepEqual(
		new Set(result.checks[0]?.diagnostics.map((diagnostic) => diagnostic.code)),
		new Set([
			'plugin.missing',
			'plugin.unresolved',
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
	assert.ok(result.summary.errors >= 8);
});
