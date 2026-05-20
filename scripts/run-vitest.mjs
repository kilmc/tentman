import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const browserFlagIndex = args.indexOf('--browser');
const browser = browserFlagIndex !== -1;

if (browser) {
	args.splice(browserFlagIndex, 1);
}

const command = 'pnpm';
const commandArgs = ['--filter', '@tentman/web', 'exec', 'vitest', ...args];
const child = spawn(command, commandArgs, {
	stdio: 'inherit',
	env: {
		...process.env,
		...(browser ? { VITEST_BROWSER: '1' } : {})
	}
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 0);
});
