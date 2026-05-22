import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	checkTentmanFormat,
	loadTentmanProject,
	summarizeFormatCheck,
	writeTentmanFormat
} from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture() {
	return copyTestAppToTempGitRepo('tentman-core-format-');
}

test('reports current fixture files Tentman would rewrite conservatively', async () => {
	const project = await loadTentmanProject(await copyFixture());
	const rewrites = await checkTentmanFormat(project);

	assert.deepEqual(rewrites, [
		{
			path: 'tentman/configs/about.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'src/routes/about/+page.md',
			kind: 'content',
			configPath: 'tentman/configs/about.tentman.json',
			formatter: 'markdown'
		},
		{
			path: 'tentman/configs/blog.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/contact.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'src/content/pages/contact.json',
			kind: 'content',
			configPath: 'tentman/configs/contact.tentman.json',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/faq.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/news.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/projects.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
	]);
	assert.deepEqual(summarizeFormatCheck(rewrites), {
		files: 8,
		configs: 6,
		content: 2,
		navigationManifests: 0
	});
});

test('reports config, file-content, and manifest files Tentman would rewrite', async () => {
	const projectRoot = await copyFixture();
	const configPath = path.join(projectRoot, 'tentman/configs/about.tentman.json');
	const contentPath = path.join(projectRoot, 'src/content/pages/news.json');
	const manifestPath = path.join(projectRoot, 'tentman/navigation-manifest.json');

	await fs.writeFile(
		configPath,
		'{\n  "type": "content",\n  "label": "About",\n  "_tentmanId": "tent_01KQD7Q12XGD83Y8S1TAHW40G3",\n  "id": "about",\n  "content": {\n    "mode": "file",\n    "path": "../../src/routes/about/+page.md"\n  },\n  "blocks": [\n    { "id": "title", "type": "text", "label": "Title", "required": true },\n    { "id": "body", "type": "markdown", "label": "Body", "required": true }\n  ]\n}'
	);
	await fs.writeFile(contentPath, '{\n  "title": "News",\n  "intro": "Write a short introduction for News.",\n  "body": "## News\\n\\nStart writing here."\n}');
	await fs.writeFile(
		manifestPath,
		'{\n  "version": 1,\n  "content": {\n    "items": [\n      "tent_01KQD7Q1301SNN4W42XV2XYA17",\n      "tent_01KQD7Q12XGD83Y8S1TAHW40G3",\n      "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07",\n      "tent_01KQD7Q130YKZ4XV6JRZ8B9BH8",\n      "tent_01KQD7Q130M4G8TR170P1H4FKX"\n    ]\n  },\n  "collections": {\n    "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07": {\n      "items": [\n        "tent_01KQD7Q12ZHBTXG669982DV00K",\n        "tent_01KQD7Q12ZH61M4XHDTEQ5MV98",\n        "tent_01KQD7Q12Y6C3T8QD4JHQ1SWPD",\n        "tent_01KQD7Q12Z8C6K7C008CDDVCR4"\n      ],\n      "groups": [\n        {\n          "id": "featured",\n          "label": "Featured posts",\n          "items": [\n            "tent_01KQD7Q12ZHBTXG669982DV00K",\n            "tent_01KQD7Q12ZH61M4XHDTEQ5MV98"\n          ]\n        }\n      ]\n    }\n  }\n}'
	);

	const project = await loadTentmanProject(projectRoot);
	const rewrites = await checkTentmanFormat(project);

	assert.deepEqual(rewrites, [
		{
			path: 'tentman/configs/about.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'src/routes/about/+page.md',
			kind: 'content',
			configPath: 'tentman/configs/about.tentman.json',
			formatter: 'markdown'
		},
		{
			path: 'tentman/configs/blog.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/contact.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'src/content/pages/contact.json',
			kind: 'content',
			configPath: 'tentman/configs/contact.tentman.json',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/faq.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/news.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'src/content/pages/news.json',
			kind: 'content',
			configPath: 'tentman/configs/news.tentman.json',
			formatter: 'json'
		},
		{
			path: 'tentman/configs/projects.tentman.json',
			kind: 'config',
			formatter: 'json'
		},
		{
			path: 'tentman/navigation-manifest.json',
			kind: 'navigation-manifest',
			formatter: 'navigation-manifest'
		},
	]);
	assert.deepEqual(summarizeFormatCheck(rewrites), {
		files: 10,
		configs: 6,
		content: 3,
		navigationManifests: 1
	});
});

test('writes Tentman-owned formatting rewrites and becomes clean on recheck', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);
	const rewrites = await writeTentmanFormat(project);

	assert.deepEqual(summarizeFormatCheck(rewrites), {
		files: 8,
		configs: 6,
		content: 2,
		navigationManifests: 0
	});

	const nextProject = await loadTentmanProject(projectRoot);
	assert.deepEqual(await checkTentmanFormat(nextProject), []);

	const aboutConfig = await fs.readFile(
		path.join(projectRoot, 'tentman/configs/about.tentman.json'),
		'utf8'
	);
	assert.ok(aboutConfig.endsWith('\n'));
	assert.match(aboutConfig, /^\{\n\t"type": "content",/);

	const contactContent = await fs.readFile(
		path.join(projectRoot, 'src/content/pages/contact.json'),
		'utf8'
	);
	assert.ok(contactContent.endsWith('\n'));
	assert.match(contactContent, /^\{\n\t"title": "Contact",/);
});

test('formats markdown-backed file singletons through core helpers', async () => {
	const projectRoot = await copyFixture();
	const configPath = path.join(projectRoot, 'tentman/configs/about.tentman.json');
	const contentPath = path.join(projectRoot, 'src/content/pages/about.md');
	const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

	config.content.path = '../../src/content/pages/about.md';
	await fs.writeFile(configPath, `${JSON.stringify(config, null, '\t')}\n`);
	await fs.writeFile(
		contentPath,
		[
			'---',
			'title: Core formatting',
			'published: true',
			'body: should-move-into-markdown-body',
			'---',
			''
		].join('\n')
	);

	const project = await loadTentmanProject(projectRoot);
	const rewrites = await checkTentmanFormat(project);
	const markdownRewrite = rewrites.find((rewrite) => rewrite.path === 'src/content/pages/about.md');

	assert.deepEqual(markdownRewrite, {
		path: 'src/content/pages/about.md',
		kind: 'content',
		configPath: 'tentman/configs/about.tentman.json',
		formatter: 'markdown'
	});

	await writeTentmanFormat(project);

	const formattedContent = await fs.readFile(contentPath, 'utf8');
	assert.equal(
		formattedContent,
		['---', 'title: Core formatting', 'published: true', '---', 'should-move-into-markdown-body'].join(
			'\n'
		)
	);

	const nextProject = await loadTentmanProject(projectRoot);
	assert.deepEqual(await checkTentmanFormat(nextProject), []);
});
