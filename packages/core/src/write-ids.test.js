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
		return `tent_01KQD8000000000000000000${String(index).padStart(2, '0')}`;
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
		groups: 0,
		items: 4,
		itemGroups: 0,
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
	assert.match(aboutConfig, /"_tentmanId": "tent_01KQD800000000000000000001"/);
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

test('writes missing collection group ids', async () => {
	const projectRoot = await copyFixture();
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.collection = {
		groups: [
			{
				label: 'Featured posts',
				value: 'featured'
			}
		]
	};
	await fs.writeFile(blogConfigPath, `${JSON.stringify(blogConfig, null, '\t')}\n`);

	const project = await loadTentmanProject(projectRoot);
	const changes = await writeMissingTentmanIds(project, {
		generateId: createDeterministicIdGenerator()
	});
	const summary = summarizeIdWriteChanges(changes);

	assert.deepEqual(summary, {
		configs: 5,
		groups: 1,
		items: 4,
		itemGroups: 0,
		files: 9
	});

	const nextProject = await loadTentmanProject(projectRoot);
	assert.equal(
		checkTentmanIds(nextProject).filter((diagnostic) => diagnostic.code === 'id.missing').length,
		0
	);

	const nextBlogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	assert.equal(
		nextBlogConfig.collection.groups[0]._tentmanId,
		'tent_01KQD800000000000000000003'
	);
});

test('replaces legacy and malformed ids', async () => {
	const projectRoot = await copyFixture();
	const aboutConfigPath = path.join(projectRoot, 'tentman/configs/about.tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const postPath = path.join(projectRoot, 'src/content/posts/designing-a-realistic-fixture.md');

	const aboutConfig = JSON.parse(await fs.readFile(aboutConfigPath, 'utf8'));
	aboutConfig._tentmanId = 'about';
	await fs.writeFile(aboutConfigPath, `${JSON.stringify(aboutConfig, null, '\t')}\n`);

	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.collection = {
		groups: [
			{
				label: 'Featured posts',
				value: 'featured',
				_tentmanId: '550e8400-e29b-41d4-a716-446655440000'
			}
		]
	};
	const blogConfigSource = `${JSON.stringify(blogConfig, null, '\t')}\n`.replace(
		/^(\t"label": "Blog Posts",)$/m,
		'$1\n\t"_tentmanId": "blog",'
	);
	await fs.writeFile(blogConfigPath, blogConfigSource);

	const postSource = await fs.readFile(postPath, 'utf8');
	await fs.writeFile(
		postPath,
		postSource.replace(
			/^title: 'Designing a realistic fixture app'$/m,
			"title: 'Designing a realistic fixture app'\n_tentmanId: 'designing-a-realistic-fixture'"
		)
	);

	const project = await loadTentmanProject(projectRoot);
	const changes = await writeMissingTentmanIds(project, {
		generateId: createDeterministicIdGenerator()
	});
	const summary = summarizeIdWriteChanges(changes);

	assert.deepEqual(summary, {
		configs: 5,
		groups: 1,
		items: 4,
		itemGroups: 0,
		files: 9
	});

	const nextProject = await loadTentmanProject(projectRoot);
	assert.equal(
		checkTentmanIds(nextProject).filter((diagnostic) => diagnostic.code === 'id.missing').length,
		0
	);
	assert.equal(
		checkTentmanIds(nextProject).filter((diagnostic) => diagnostic.code === 'id.legacy').length,
		0
	);

	const nextAboutConfig = JSON.parse(await fs.readFile(aboutConfigPath, 'utf8'));
	assert.equal(nextAboutConfig._tentmanId, 'tent_01KQD800000000000000000001');

	const nextBlogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	assert.equal(
		nextBlogConfig.collection.groups[0]._tentmanId,
		'tent_01KQD800000000000000000003'
	);

	const nextPostSource = await fs.readFile(postPath, 'utf8');
	assert.match(
		nextPostSource,
		/title: 'Designing a realistic fixture app'\n_tentmanId: 'tent_01KQD800000000000000000005'/
	);
	assert.doesNotMatch(nextPostSource, /_tentmanId: 'designing-a-realistic-fixture'/);
});

test('backfills _tentmanGroupId from legacy group values without rewriting group', async () => {
	const projectRoot = await copyFixture();
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.collection = {
		groups: [
			{
				label: 'Featured posts',
				value: 'featured'
			}
		]
	};
	blogConfig.blocks.splice(4, 0, {
		type: 'tentmanGroup',
		label: 'Group',
		collection: 'blog'
	});
	await fs.writeFile(blogConfigPath, `${JSON.stringify(blogConfig, null, '\t')}\n`);

	const postPath = path.join(projectRoot, 'src/content/posts/testing-content-workflows.md');
	const postSource = await fs.readFile(postPath, 'utf8');
	await fs.writeFile(
		postPath,
		postSource.replace(
			"slug: testing-content-workflows\n",
			"slug: testing-content-workflows\ngroup: featured\n"
		)
	);

	const project = await loadTentmanProject(projectRoot);
	const changes = await writeMissingTentmanIds(project, {
		generateId: createDeterministicIdGenerator()
	});
	const summary = summarizeIdWriteChanges(changes);

	assert.deepEqual(summary, {
		configs: 5,
		groups: 1,
		items: 4,
		itemGroups: 1,
		files: 9
	});

	const nextPostSource = await fs.readFile(postPath, 'utf8');
	assert.match(nextPostSource, /group: featured/);
	assert.match(nextPostSource, /_tentmanGroupId: 'tent_01KQD800000000000000000003'/);
});

test('does not overwrite an existing _tentmanGroupId during backfill', async () => {
	const projectRoot = await copyFixture();
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.collection = {
		groups: [
			{
				label: 'Featured posts',
				value: 'featured'
			}
		]
	};
	blogConfig.blocks.splice(4, 0, {
		type: 'tentmanGroup',
		label: 'Group',
		collection: 'blog'
	});
	await fs.writeFile(blogConfigPath, `${JSON.stringify(blogConfig, null, '\t')}\n`);

	const postPath = path.join(projectRoot, 'src/content/posts/testing-content-workflows.md');
	const postSource = await fs.readFile(postPath, 'utf8');
	await fs.writeFile(
		postPath,
		postSource.replace(
			"slug: testing-content-workflows\n",
			"slug: testing-content-workflows\n_tentmanGroupId: 'tent_existing_group'\ngroup: featured\n"
		)
	);

	const project = await loadTentmanProject(projectRoot);
	const changes = await writeMissingTentmanIds(project, {
		generateId: createDeterministicIdGenerator()
	});
	const summary = summarizeIdWriteChanges(changes);

	assert.deepEqual(summary, {
		configs: 5,
		groups: 1,
		items: 4,
		itemGroups: 0,
		files: 9
	});

	const nextPostSource = await fs.readFile(postPath, 'utf8');
	assert.match(nextPostSource, /_tentmanGroupId: 'tent_existing_group'/);
	assert.match(nextPostSource, /group: featured/);
});
