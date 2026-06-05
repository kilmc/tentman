import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const browserFlagIndex = args.indexOf('--browser');
const browser = browserFlagIndex !== -1;

if (browser) {
	args.splice(browserFlagIndex, 1);
}

const env = {
	...process.env,
	...(browser ? { VITEST_BROWSER: '1' } : {})
};

const run = (command, commandArgs) =>
	new Promise((resolve) => {
		const child = spawn(command, commandArgs, {
			stdio: 'inherit',
			env
		});

		child.on('exit', (code, signal) => {
			resolve({ code: code ?? 0, signal });
		});
	});

if (browser) {
	const result = await run('pnpm', ['--filter', '@tentman/web', 'run', 'test:browser:sync']);
	if (result.signal) {
		process.kill(process.pid, result.signal);
	}
	if (result.code !== 0) {
		process.exit(result.code);
	}
}

const result = await run('pnpm', ['--filter', '@tentman/web', 'exec', 'vitest', ...args]);
if (result.signal) {
	process.kill(process.pid, result.signal);
}

process.exit(result.code);
