import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checkTentmanAssets, loadTentmanProject, runTentmanCi } from './index.js';
import { serializeJson } from './json.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture() {
	return copyTestAppToTempGitRepo('tentman-core-assets-');
}

test('checks current fixture assets conservatively', async () => {
	const project = await loadTentmanProject(await copyFixture());
	const diagnostics = await checkTentmanAssets(project);

	assert.deepEqual(diagnostics, []);
});

test('reports missing asset files, path mismatches, and missing asset directories', async () => {
	const projectRoot = await copyFixture();
	const blogPostPath = path.join(projectRoot, 'src/content/posts/designing-a-realistic-fixture.md');
	const aboutContentPath = path.join(projectRoot, 'src/routes/about/+page.md');
	const blockConfigPath = path.join(projectRoot, 'tentman/blocks/image-gallery.tentman.json');

	const blogPost = await fs.readFile(blogPostPath, 'utf8');
	await fs.writeFile(
		blogPostPath,
		blogPost.replace("/images/posts/fixture-grid.svg", "/images/posts/missing-cover.svg")
	);

	const aboutContent = await fs.readFile(aboutContentPath, 'utf8');
	await fs.writeFile(
		aboutContentPath,
		aboutContent.replace('/images/gallery/paper-stack.svg', '/images/posts/fixture-grid.svg')
	);

	const blockConfig = JSON.parse(await fs.readFile(blockConfigPath, 'utf8'));
	blockConfig.blocks[0].assetsDir = '../../static/images/missing-gallery';
	await fs.writeFile(blockConfigPath, serializeJson(blockConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await checkTentmanAssets(project);

	assert.ok(
		diagnostics.some((diagnostic) => diagnostic.code === 'assets.missing-directory')
	);
	assert.ok(
		diagnostics.some((diagnostic) => diagnostic.code === 'assets.missing-file')
	);
	assert.ok(
		diagnostics.some((diagnostic) => diagnostic.code === 'assets.path-mismatch')
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.missing-file')?.message ?? '',
		/field coverImage references missing asset \/images\/posts\/missing-cover\.svg/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.path-mismatch')?.message ?? '',
		/field gallery\.items\[0\]\.image uses \/images\/posts\/fixture-grid\.svg, but expected a path under \/images\/missing-gallery/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.missing-directory')?.message ?? '',
		/missing assets directory: static\/images\/missing-gallery/
	);
});

test('includes assets check in tentman ci aggregation', async () => {
	const project = await loadTentmanProject(await copyFixture());
	const result = await runTentmanCi(project);

	assert.deepEqual(
		result.checks.map((check) => check.id),
		['doctor', 'ids', 'nav', 'format', 'assets']
	);
	assert.equal(result.checks[4]?.errors, 0);
	assert.equal(result.checks[4]?.warnings, 0);
	assert.equal(result.summary.checks, 5);
});
