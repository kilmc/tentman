import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checkTentmanAssets, loadTentmanProject, runTentmanCi } from './index.js';
import { serializeJson } from './json.js';
import {
	copyCoreFixtureProjectToTempGitRepo,
	loadCoreFixtureProject
} from './test-paths.test-helper.js';

async function copyFixture(t) {
	return copyCoreFixtureProjectToTempGitRepo(t, 'tentman-core-assets-');
}

test('checks current fixture assets conservatively', async () => {
	const project = await loadCoreFixtureProject();
	const diagnostics = await checkTentmanAssets(project);

	assert.deepEqual(diagnostics, []);
});

test('reports missing asset files and path mismatches', async (t) => {
	const projectRoot = await copyFixture(t);
	const blogPostPath = path.join(projectRoot, 'src/content/posts/designing-a-realistic-fixture.md');
	const aboutContentPath = path.join(projectRoot, 'src/routes/about/+page.md');

	const blogPost = await fs.readFile(blogPostPath, 'utf8');
	await fs.writeFile(
		blogPostPath,
		blogPost.replace('/images/posts/fixture-grid.svg', '/images/posts/missing-cover.svg')
	);

	const aboutContent = await fs.readFile(aboutContentPath, 'utf8');
	await fs.writeFile(
		aboutContentPath,
		aboutContent.replace('/images/gallery/paper-stack.svg', '/other/fixture-grid.svg')
	);

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await checkTentmanAssets(project);

	assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'assets.missing-file'));
	assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'assets.path-mismatch'));
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.missing-file')?.message ?? '',
		/field coverImage references missing asset \/images\/posts\/missing-cover\.svg/
	);
	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.path-mismatch')?.message ?? '',
		/field gallery\.items\[0\]\.image uses \/other\/fixture-grid\.svg, but expected a path under \/images/
	);
});

test('reports missing non-image assets referenced from markdown links and html media', async (t) => {
	const projectRoot = await copyFixture(t);
	const aboutContentPath = path.join(projectRoot, 'src/routes/about/+page.md');
	const aboutContent = await fs.readFile(aboutContentPath, 'utf8');
	await fs.writeFile(
		aboutContentPath,
		aboutContent.replace(
			'</section>',
			[
				'[Download the brief](/images/media/missing-brief.pdf)',
				'<audio controls src="/images/media/missing-interview.mp3"></audio>',
				'<video controls><source src="/images/media/missing-trailer.mp4" type="video/mp4"></video>',
				'<video poster="/images/media/missing-trailer-poster.jpg"></video>',
				'</section>'
			].join('\n\n')
		)
	);

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await checkTentmanAssets(project);

	assert.ok(
		diagnostics.some((diagnostic) =>
			diagnostic.message.includes(
				'body.markdownLinks[0] references missing asset /images/media/missing-brief.pdf'
			)
		)
	);
	assert.ok(
		diagnostics.some((diagnostic) =>
			diagnostic.message.includes(
				'body.htmlMedia[0] references missing asset /images/media/missing-interview.mp3'
			)
		)
	);
	assert.ok(
		diagnostics.some((diagnostic) =>
			diagnostic.message.includes(
				'body.htmlMedia[1] references missing asset /images/media/missing-trailer.mp4'
			)
		)
	);
	assert.ok(
		diagnostics.some((diagnostic) =>
			diagnostic.message.includes(
				'body.htmlMedia[2] references missing asset /images/media/missing-trailer-poster.jpg'
			)
		)
	);
});

test('reports missing root asset directory', async (t) => {
	const projectRoot = await copyFixture(t);
	const rootConfigPath = path.join(projectRoot, 'tentman.json');
	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assets.path = './static/missing-images';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await checkTentmanAssets(project);

	assert.match(
		diagnostics.find((diagnostic) => diagnostic.code === 'assets.missing-directory')?.message ?? '',
		/Configured assets directory does not exist: static\/missing-images\//
	);
});

test('warns for legacy assetsDir without using it for checks', async (t) => {
	const projectRoot = await copyFixture(t);
	const rootConfigPath = path.join(projectRoot, 'tentman.json');
	const blogConfigPath = path.join(projectRoot, 'tentman/configs/blog.tentman.json');

	const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, 'utf8'));
	rootConfig.assetsDir = './static/missing-images';
	await fs.writeFile(rootConfigPath, serializeJson(rootConfig));

	const blogConfig = JSON.parse(await fs.readFile(blogConfigPath, 'utf8'));
	blogConfig.blocks[4].assetsDir = '../../static/images/missing-posts';
	await fs.writeFile(blogConfigPath, serializeJson(blogConfig));

	const project = await loadTentmanProject(projectRoot);
	const diagnostics = await checkTentmanAssets(project);

	assert.equal(
		diagnostics.filter((diagnostic) => diagnostic.code === 'assets.legacy-assets-dir').length,
		2
	);
	assert.ok(!diagnostics.some((diagnostic) => diagnostic.message.includes('missing-posts')));
	assert.ok(!diagnostics.some((diagnostic) => diagnostic.message.includes('missing-images')));
});

test('includes assets check in tentman ci aggregation', async () => {
	const project = await loadCoreFixtureProject();
	const result = await runTentmanCi(project);

	assert.deepEqual(
		result.checks.map((check) => check.id),
		['doctor', 'ids', 'nav', 'format', 'assets']
	);
	assert.equal(result.checks[4]?.errors, 0);
	assert.equal(result.checks[4]?.warnings, 0);
	assert.equal(result.summary.checks, 5);
});
