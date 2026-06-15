import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const testAppRoot = path.resolve(repoRoot, '../test-app');
export const contentComponentsFixturesRoot = path.join(
	repoRoot,
	'packages/core/src/fixtures/content-components'
);

export async function copyTestAppToTempGitRepo(prefix = 'tentman-core-fixture-') {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	await execFileAsync('git', ['init', '--quiet'], { cwd: projectRoot });
	return projectRoot;
}
