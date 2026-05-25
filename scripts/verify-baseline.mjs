import { spawn } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const steps = [
	{
		label: 'Type and architectural checks',
		args: ['run', 'check']
	},
	{
		label: 'Production build',
		args: ['run', 'build']
	},
	{
		label: 'Core package tests',
		args: ['run', 'test:core']
	},
	{
		label: 'Web unit tests',
		args: ['run', 'test:unit', '--', '--run']
	}
];

for (const [index, step] of steps.entries()) {
	console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);

	const exitCode = await new Promise((resolve, reject) => {
		const child = spawn(pnpmCommand, step.args, {
			stdio: 'inherit',
			env: process.env
		});

		child.on('error', reject);
		child.on('close', resolve);
	});

	if (exitCode !== 0) {
		process.exit(exitCode ?? 1);
	}
}

console.log('\nBaseline verification passed.');
