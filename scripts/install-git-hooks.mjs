import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

if (process.env.CI === 'true' || process.env.SKIP_GIT_HOOKS === '1') {
	process.exit(0);
}

function runGit(args, options = {}) {
	return execFileSync('git', args, {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...options
	}).trim();
}

try {
	const gitRoot = runGit(['rev-parse', '--show-toplevel']);
	if (path.resolve(gitRoot) !== repoRoot) {
		process.exit(0);
	}
} catch {
	process.exit(0);
}

let currentHooksPath = '';

try {
	currentHooksPath = runGit(['config', '--get', 'core.hooksPath']);
} catch {
	currentHooksPath = '';
}

if (currentHooksPath && currentHooksPath !== '.githooks') {
	console.log(
		`Skipping Tentman git hook install because core.hooksPath is already set to ${currentHooksPath}.`
	);
	process.exit(0);
}

if (currentHooksPath === '.githooks') {
	process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
	cwd: repoRoot,
	stdio: 'inherit'
});

console.log('Configured git hooks to use .githooks.');
