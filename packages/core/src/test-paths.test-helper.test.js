import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	copyCoreFixtureProjectToTempGitRepo,
	coreFixtureProjectRoot,
	loadCoreFixtureProject
} from './test-paths.test-helper.js';

async function pathExists(absolutePath) {
	try {
		await fs.access(absolutePath);
		return true;
	} catch {
		return false;
	}
}

test('loads the repo-owned core fixture project without copying it', async () => {
	const project = await loadCoreFixtureProject();

	assert.equal(project.rootDir, coreFixtureProjectRoot);
	assert.equal(project.rootConfig.siteName, 'Test App');
});

test('copies the core fixture to a small self-cleaning temp git repo', async (t) => {
	const projectRoot = await copyCoreFixtureProjectToTempGitRepo(t);

	assert.equal(path.basename(projectRoot), 'core-project');
	assert.equal(await pathExists(path.join(projectRoot, 'tentman.json')), true);
	assert.equal(await pathExists(path.join(projectRoot, 'node_modules')), false);
	assert.equal(await pathExists(path.join(projectRoot, '.svelte-kit')), false);

	const gitBoundary = await fs.stat(path.join(projectRoot, '.git'));
	assert.equal(gitBoundary.isDirectory(), true);
});
