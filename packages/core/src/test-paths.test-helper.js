import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadTentmanProject } from './project.js';

const execFileAsync = promisify(execFile);

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const coreFixtureProjectRoot = path.join(
	repoRoot,
	'packages/core/src/fixtures/core-project'
);
export const contentComponentsFixturesRoot = path.join(
	repoRoot,
	'packages/core/src/fixtures/content-components'
);

export async function loadCoreFixtureProject() {
	return loadTentmanProject(coreFixtureProjectRoot);
}

// Use loadCoreFixtureProject for read-only assertions. Use this helper only when a
// test mutates project files; it owns cleanup through the node:test context.
export async function copyCoreFixtureProjectToTempGitRepo(t, prefix = 'tentman-core-fixture-') {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const projectRoot = path.join(tempRoot, 'core-project');
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
	await fs.cp(coreFixtureProjectRoot, projectRoot, { recursive: true });
	await fs.rm(path.join(projectRoot, '.git'), { force: true, recursive: true });
	await execFileAsync('git', ['init', '--quiet'], { cwd: projectRoot });
	return projectRoot;
}
