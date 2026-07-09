import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { findUnusedTentmanAssets, loadTentmanProject } from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture() {
	return copyTestAppToTempGitRepo('tentman-core-assets-unused-');
}

test('reports no unused files in configured asset directories for the fixture', async () => {
	const project = await loadTentmanProject(await copyFixture());
	const unused = await findUnusedTentmanAssets(project);

	assert.deepEqual(
		unused.map((entry) => [entry.path, entry.unusedCount]),
		[['static/images', 2]]
	);
	assert.deepEqual(unused[0]?.unusedFiles, [
		'static/images/untitled-project-arcade-glow-8x-79765380.png',
		'static/images/untitled-project-arcade-glow-8x-7e99f33d.png'
	]);
});

test('scans loose root assets inside root assets path', async () => {
	const project = await loadTentmanProject(await copyFixture());
	const unused = await findUnusedTentmanAssets(project);

	assert.ok(
		unused.some((entry) =>
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
			[
				'static/images',
				[
					'static/images/gallery/orphan.svg',
					'static/images/posts/orphan.svg',
					'static/images/untitled-project-arcade-glow-8x-79765380.png',
					'static/images/untitled-project-arcade-glow-8x-7e99f33d.png'
				]
			]
		]
	);
});

test('treats non-image markdown link and html media assets as referenced', async () => {
	const projectRoot = await copyFixture();
	const aboutContentPath = path.join(projectRoot, 'src/routes/about/+page.md');
	const mediaDir = path.join(projectRoot, 'static/images/media');
	await fs.mkdir(mediaDir, { recursive: true });
	await fs.writeFile(path.join(mediaDir, 'brief.pdf'), '');
	await fs.writeFile(path.join(mediaDir, 'interview.mp3'), '');
	await fs.writeFile(path.join(mediaDir, 'trailer.mp4'), '');
	await fs.writeFile(path.join(mediaDir, 'trailer-poster.jpg'), '');

	const aboutContent = await fs.readFile(aboutContentPath, 'utf8');
	await fs.writeFile(
		aboutContentPath,
		aboutContent.replace(
			'</section>',
			[
				'[Download the brief](/images/media/brief.pdf)',
				'<audio controls src="/images/media/interview.mp3"></audio>',
				'<video controls><source src="/images/media/trailer.mp4" type="video/mp4"></video>',
				'<video poster="/images/media/trailer-poster.jpg" src="/images/media/trailer.mp4"></video>',
				'</section>'
			].join('\n\n')
		)
	);

	const project = await loadTentmanProject(projectRoot);
	const unused = await findUnusedTentmanAssets(project);
	const unusedFiles = unused.flatMap((entry) => entry.unusedFiles);

	assert.ok(!unusedFiles.includes('static/images/media/brief.pdf'));
	assert.ok(!unusedFiles.includes('static/images/media/interview.mp3'));
	assert.ok(!unusedFiles.includes('static/images/media/trailer.mp4'));
	assert.ok(!unusedFiles.includes('static/images/media/trailer-poster.jpg'));
});

test('scopes unused asset results to one config when requested', async () => {
	const projectRoot = await copyFixture();
	const orphanGalleryAsset = path.join(projectRoot, 'static/images/gallery/orphan.svg');

	await fs.writeFile(orphanGalleryAsset, '<svg></svg>\n');

	const project = await loadTentmanProject(projectRoot);
	const unused = await findUnusedTentmanAssets(project, 'about');

	assert.equal(unused.config.label, 'About');
	assert.deepEqual(
		unused.directories.map((entry) => [entry.path, entry.unusedFiles]),
		[
			[
				'static/images',
				[
					'static/images/gallery/orphan.svg',
					'static/images/untitled-project-arcade-glow-8x-79765380.png',
					'static/images/untitled-project-arcade-glow-8x-7e99f33d.png'
				]
			]
		]
	);
	assert.deepEqual(unused.unusedFiles, [
		{
			path: 'static/images/gallery/orphan.svg',
			directoryPath: 'static/images',
			expectedPrefix: '/images'
		},
		{
			path: 'static/images/untitled-project-arcade-glow-8x-79765380.png',
			directoryPath: 'static/images',
			expectedPrefix: '/images'
		},
		{
			path: 'static/images/untitled-project-arcade-glow-8x-7e99f33d.png',
			directoryPath: 'static/images',
			expectedPrefix: '/images'
		}
	]);
});
