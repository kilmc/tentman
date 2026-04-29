import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	checkTentmanIds,
	loadTentmanProject,
	summarizeIdWriteChanges,
	writeMissingTentmanIds
} from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	await stripFixtureIds(projectRoot);
	return projectRoot;
}

async function stripFixtureIds(projectRoot) {
	const files = [
		'tentman/configs/about.tentman.json',
		'tentman/configs/blog.tentman.json',
		'tentman/configs/contact.tentman.json',
		'tentman/configs/news.tentman.json',
		'tentman/configs/projects.tentman.json',
		'src/content/posts/blooop.md',
		'src/content/posts/designing-a-realistic-fixture.md',
		'src/content/posts/stuff-2.md',
		'src/content/posts/testing-content-workflows.md'
	];

	for (const file of files) {
		const absolutePath = path.join(projectRoot, file);
		const source = await fs.readFile(absolutePath, 'utf8');
		await fs.writeFile(absolutePath, source.replace(/^\s*_tentmanId:.*\n|^\s*"_tentmanId":.*\n/gm, ''));
	}
}

function createDeterministicIdGenerator() {
	let index = 0;

	return () => {
		index += 1;
		return `tent_01KQD800000000000000000${String(index).padStart(2, '0')}`;
	};
}

test('writes missing config and collection item ids', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);
	const changes = await writeMissingTentmanIds(project, {
		generateId: createDeterministicIdGenerator()
	});
	const summary = summarizeIdWriteChanges(changes);

	assert.deepEqual(summary, {
		configs: 5,
		items: 4,
		files: 9
	});

	const nextProject = await loadTentmanProject(projectRoot);
	assert.equal(
		checkTentmanIds(nextProject).filter((diagnostic) => diagnostic.code === 'id.missing').length,
		0
	);

	const aboutConfig = await fs.readFile(
		path.join(projectRoot, 'tentman/configs/about.tentman.json'),
		'utf8'
	);
	assert.match(aboutConfig, /"_tentmanId": "tent_01KQD80000000000000000001"/);
	assert.match(
		aboutConfig,
		/\{ "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" \}/
	);

	const post = await fs.readFile(
		path.join(projectRoot, 'src/content/posts/designing-a-realistic-fixture.md'),
		'utf8'
	);
	assert.match(post, /title: 'Designing a realistic fixture app'\n_tentmanId: 'tent_/);
});
