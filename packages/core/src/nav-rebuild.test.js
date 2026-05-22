import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	checkNavigationManifest,
	loadTentmanProject,
	parseNavigationManifest,
	rebuildNavigationManifest
} from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture() {
	return copyTestAppToTempGitRepo('tentman-core-nav-rebuild-');
}

test('rebuilds navigation manifest from current configs and content', async () => {
	const projectRoot = await copyFixture();
	await fs.writeFile(
		path.join(projectRoot, 'tentman/navigation-manifest.json'),
		'{\n\t"version": 1,\n\t"content": {\n\t\t"items": ["about"]\n\t}\n}\n'
	);
	const project = await loadTentmanProject(projectRoot);
	const result = await rebuildNavigationManifest(project);

	assert.equal(result.changed, true);

	const nextProject = await loadTentmanProject(projectRoot);
	assert.equal(checkNavigationManifest(nextProject).length, 0);

	const manifest = parseNavigationManifest(
		await fs.readFile(path.join(projectRoot, 'tentman/navigation-manifest.json'), 'utf8')
	);

	assert.deepEqual(manifest.content.items, [
		{ id: 'tent_01KTVA0B0VT000000000000001', label: 'About', slug: 'about' },
		{ id: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07', label: 'Blog Posts', slug: 'blog' },
		{ id: 'tent_01KTVA0B0VT000000000000002', label: 'Contact', slug: 'contact' },
		{ id: 'tent_01KTVA0B0VT000000000000003', label: 'FAQ', slug: 'faq' },
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
				id: 'tent_01KTVA0B0VT000000000000004',
				label: 'Rendering with content components',
				slug: 'rendering-with-content-components'
			},
			{
				id: 'tent_01KTVA0B0VT000000000000005',
				label: 'Designing a reliable fixture',
				slug: 'designing-a-reliable-fixture'
			},
			{
				id: 'tent_01KTVA0B0VT000000000000006',
				label: 'FAQ as a nested content model',
				slug: 'faq-as-a-nested-content-model'
			},
			{
				id: 'tent_01KTVA0B0VT000000000000007',
				label: 'Why this test app is so plain',
				slug: 'why-this-test-app-is-so-plain'
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

	const postPath = path.join(projectRoot, 'src/content/posts/blooop.md');
	const post = await fs.readFile(postPath, 'utf8');
	await fs.writeFile(
		postPath,
		post.replace(
			"slug: rendering-with-content-components\n",
			"slug: rendering-with-content-components\n_tentmanGroupId: tent_01KQD7Q131PWFNF90HG24K63ZD\ngroup: featured\n"
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
					id: 'tent_01KTVA0B0VT000000000000004',
					label: 'Rendering with content components',
					slug: 'rendering-with-content-components'
				}
			]
		}
	]);
	assert.deepEqual(blogCollection.items, [
		{
			id: 'tent_01KTVA0B0VT000000000000004',
			label: 'Rendering with content components',
			slug: 'rendering-with-content-components'
		},
		{
			id: 'tent_01KTVA0B0VT000000000000005',
			label: 'Designing a reliable fixture',
			slug: 'designing-a-reliable-fixture'
		},
		{
			id: 'tent_01KTVA0B0VT000000000000006',
			label: 'FAQ as a nested content model',
			slug: 'faq-as-a-nested-content-model'
		},
		{
			id: 'tent_01KTVA0B0VT000000000000007',
			label: 'Why this test app is so plain',
			slug: 'why-this-test-app-is-so-plain'
		}
	]);
});
