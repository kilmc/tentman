import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findUnusedTentmanAssets, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-assets-unused-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	return projectRoot;
}

test('reports no unused files in configured asset directories for the fixture', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const unused = await findUnusedTentmanAssets(project);

	assert.deepEqual(
		unused.map((entry) => [entry.path, entry.unusedCount]),
		[
			['static/images/gallery', 0],
			['static/images/posts', 0]
		]
	);
	assert.ok(unused.every((entry) => entry.unusedFiles.length === 0));
});

test('ignores loose root assets outside explicit image field directories', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const unused = await findUnusedTentmanAssets(project);

	assert.ok(!unused.some((entry) => entry.path === 'static/images'));
	assert.ok(
		!unused.some((entry) =>
			entry.unusedFiles.includes('static/images/untitled-project-arcade-glow-8x-79765380.png')
		)
	);
});

test('finds unused files conservatively in known asset directories', async () => {
	const projectRoot = await copyFixture();
	const orphanPostAsset = path.join(projectRoot, 'static/images/posts/orphan.svg');
	const orphanGalleryAsset = path.join(projectRoot, 'static/images/gallery/orphan.svg');

	await fs.writeFile(orphanPostAsset, '<svg></svg>\n');
	await fs.writeFile(orphanGalleryAsset, '<svg></svg>\n');

	const project = await loadTentmanProject(projectRoot);
	const unused = await findUnusedTentmanAssets(project);

	assert.deepEqual(
		unused.map((entry) => [entry.path, entry.unusedFiles]),
		[
			['static/images/gallery', ['static/images/gallery/orphan.svg']],
			['static/images/posts', ['static/images/posts/orphan.svg']]
		]
	);
});

test('scopes unused asset results to one config when requested', async () => {
	const projectRoot = await copyFixture();
	const orphanGalleryAsset = path.join(projectRoot, 'static/images/gallery/orphan.svg');

	await fs.writeFile(orphanGalleryAsset, '<svg></svg>\n');

	const project = await loadTentmanProject(projectRoot);
	const unused = await findUnusedTentmanAssets(project, 'about');

	assert.equal(unused.config.label, 'About Page');
	assert.deepEqual(
		unused.directories.map((entry) => [entry.path, entry.unusedFiles]),
		[['static/images/gallery', ['static/images/gallery/orphan.svg']]]
	);
	assert.deepEqual(unused.unusedFiles, [
		{
			path: 'static/images/gallery/orphan.svg',
			directoryPath: 'static/images/gallery',
			expectedPrefix: '/images/gallery'
		}
	]);
});
