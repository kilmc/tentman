import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	checkTentmanFormat,
	loadTentmanProject,
	summarizeFormatCheck,
	writeTentmanFormat
} from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-format-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	return projectRoot;
}

test('reports current fixture files Tentman would rewrite conservatively', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const rewrites = await checkTentmanFormat(project);

	assert.deepEqual(rewrites, [
		{
			path: 'tentman/configs/about.tentman.json',
			kind: 'config',
			formatter: 'json'
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
			path: 'tentman/configs/news.tentman.json',
			kind: 'config',
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
		}
	]);
	assert.deepEqual(summarizeFormatCheck(rewrites), {
		files: 7,
		configs: 5,
		content: 1,
		navigationManifests: 1
	});
});

test('reports config, file-content, and manifest files Tentman would rewrite', async () => {
	const projectRoot = await copyFixture();
	const configPath = path.join(projectRoot, 'tentman/configs/about.tentman.json');
	const contentPath = path.join(projectRoot, 'src/content/pages/news.json');
	const manifestPath = path.join(projectRoot, 'tentman/navigation-manifest.json');

	await fs.writeFile(
		configPath,
		'{\n  "type": "content",\n  "label": "About",\n  "_tentmanId": "tent_01KQD7Q12XGD83Y8S1TAHW40G3",\n  "id": "about",\n  "content": {\n    "mode": "file",\n    "path": "../../src/content/pages/about.json"\n  },\n  "blocks": [\n    { "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },\n    { "id": "body", "type": "markdown", "label": "Body", "required": true }\n  ]\n}'
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
		}
	]);
	assert.deepEqual(summarizeFormatCheck(rewrites), {
		files: 8,
		configs: 5,
		content: 2,
		navigationManifests: 1
	});
});

test('writes Tentman-owned formatting rewrites and becomes clean on recheck', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);
	const rewrites = await writeTentmanFormat(project);

	assert.deepEqual(summarizeFormatCheck(rewrites), {
		files: 7,
		configs: 5,
		content: 1,
		navigationManifests: 1
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
	assert.match(contactContent, /^\{\n\t"title": "Contact the test team",/);
});
