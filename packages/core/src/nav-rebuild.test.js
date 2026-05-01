import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	checkNavigationManifest,
	loadTentmanProject,
	parseNavigationManifest,
	rebuildNavigationManifest
} from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-nav-rebuild-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	return projectRoot;
}

test('rebuilds navigation manifest from current configs and content', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);
	const result = await rebuildNavigationManifest(project);

	assert.equal(result.changed, true);

	const nextProject = await loadTentmanProject(projectRoot);
	assert.equal(checkNavigationManifest(nextProject).length, 0);

	const manifest = parseNavigationManifest(
		await fs.readFile(path.join(projectRoot, 'tentman/navigation-manifest.json'), 'utf8')
	);

	assert.deepEqual(manifest.content.items, [
		{ id: 'tent_01KQD7Q12XGD83Y8S1TAHW40G3', label: 'About Page', slug: 'about' },
		{ id: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07', label: 'Blog Posts', slug: 'blog' },
		{ id: 'tent_01KQD7Q1301SNN4W42XV2XYA17', label: 'Contact Page', slug: 'contact' },
		{ id: 'tent_01KQD7Q130YKZ4XV6JRZ8B9BH8', label: 'News', slug: 'news' },
		{ id: 'tent_01KQD7Q130M4G8TR170P1H4FKX', label: 'Projects', slug: 'projects' }
	]);
	assert.deepEqual(manifest.collections.tent_01KQD7Q12YAMHFJ3FWHBQ16Z07, {
		id: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07',
		label: 'Blog Posts',
		slug: 'blog',
		configId: 'blog',
		items: [
			{
				id: 'tent_01KQD7Q12Y6C3T8QD4JHQ1SWPD',
				label: 'Another Page',
				slug: 'another-page'
			},
			{
				id: 'tent_01KQD7Q12ZH61M4XHDTEQ5MV98',
				label: 'Designing a realistic fixture app',
				slug: 'designing-a-realistic-fixture'
			},
			{
				id: 'tent_01KQD7Q12Z8C6K7C008CDDVCR4',
				label: 'Stuff 2',
				slug: 'stuff-2'
			},
			{
				id: 'tent_01KQD7Q12ZHBTXG669982DV00K',
				label: 'Testing the new content workflows',
				slug: 'testing-content-workflows'
			}
		]
	});
});

test('rebuilds config-backed collection groups', async () => {
	const projectRoot = await copyFixture();
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');
	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.collection = {
		groups: [
			{
				_tentmanId: 'tent_01KQD7Q131PWFNF90HG24K63ZD',
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
	const post = await fs.readFile(postPath, 'utf8');
	await fs.writeFile(
		postPath,
		post.replace(
			"slug: testing-content-workflows\n",
			"slug: testing-content-workflows\n_tentmanGroupId: tent_01KQD7Q131PWFNF90HG24K63ZD\ngroup: featured\n"
		)
	);

	const project = await loadTentmanProject(projectRoot);
	await rebuildNavigationManifest(project);

	const manifest = parseNavigationManifest(
		await fs.readFile(path.join(projectRoot, 'tentman/navigation-manifest.json'), 'utf8')
	);
	const blogCollection = manifest.collections.tent_01KQD7Q12YAMHFJ3FWHBQ16Z07;

	assert.equal(blogCollection.configId, 'blog');
	assert.deepEqual(blogCollection.groups, [
		{
			id: 'tent_01KQD7Q131PWFNF90HG24K63ZD',
			label: 'Featured posts',
			value: 'featured',
			items: [
				{
					id: 'tent_01KQD7Q12ZHBTXG669982DV00K',
					label: 'Testing the new content workflows',
					slug: 'testing-content-workflows'
				}
			]
		}
	]);
	assert.deepEqual(blogCollection.items, [
		{
			id: 'tent_01KQD7Q12ZHBTXG669982DV00K',
			label: 'Testing the new content workflows',
			slug: 'testing-content-workflows'
		},
		{
			id: 'tent_01KQD7Q12Y6C3T8QD4JHQ1SWPD',
			label: 'Another Page',
			slug: 'another-page'
		},
		{
			id: 'tent_01KQD7Q12ZH61M4XHDTEQ5MV98',
			label: 'Designing a realistic fixture app',
			slug: 'designing-a-realistic-fixture'
		},
		{
			id: 'tent_01KQD7Q12Z8C6K7C008CDDVCR4',
			label: 'Stuff 2',
			slug: 'stuff-2'
		}
	]);
});
