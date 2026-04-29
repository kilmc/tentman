#!/usr/bin/env node
import {
	checkTentmanIds,
	checkNavigationManifest,
	doctorTentmanProject,
	loadTentmanProject,
	rebuildNavigationManifest,
	refreshNavigationManifest,
	summarizeIdWriteChanges,
	summarizeNavigationRefreshChanges,
	writeMissingTentmanIds
} from '@tentman/core';
import path from 'node:path';

function printHelp() {
	console.log(`Tentman CLI

Usage:
  tentman doctor [project-root]
  tentman ids check [project-root]
  tentman ids write [project-root]
  tentman nav check [project-root]
  tentman nav refresh [project-root]
  tentman nav rebuild [project-root]

Options:
  --json      Print machine-readable diagnostics
  -h, --help  Show help
`);
}

function parseArgs(argv) {
	const flags = new Set(argv.filter((arg) => arg.startsWith('-')));
	const positional = argv.filter((arg) => !arg.startsWith('-'));

	return {
		flags,
		positional
	};
}

function getProjectRoot(positional, commandLength) {
	const projectRoot = positional[commandLength] ?? process.cwd();

	if (path.isAbsolute(projectRoot)) {
		return projectRoot;
	}

	return path.resolve(process.env.INIT_CWD ?? process.cwd(), projectRoot);
}

function getDiagnosticCounts(diagnostics) {
	return {
		errors: diagnostics.filter((diagnostic) => diagnostic.level === 'error').length,
		warnings: diagnostics.filter((diagnostic) => diagnostic.level === 'warning').length
	};
}

function printDiagnostics(title, diagnostics, options = {}) {
	const counts = getDiagnosticCounts(diagnostics);

	if (options.json) {
		console.log(JSON.stringify({ title, ...counts, diagnostics }, null, 2));
		return;
	}

	console.log(title);

	if (diagnostics.length === 0) {
		console.log('OK');
		return;
	}

	for (const diagnostic of diagnostics) {
		const location = diagnostic.path ? ` (${diagnostic.path})` : '';
		console.log(`${diagnostic.level.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}${location}`);
	}

	console.log(`\n${counts.errors} error${counts.errors === 1 ? '' : 's'}, ${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`);
}

async function run() {
	const { flags, positional } = parseArgs(process.argv.slice(2));

	if (flags.has('-h') || flags.has('--help') || positional.length === 0) {
		printHelp();
		return 0;
	}

	const json = flags.has('--json');
	const [command, subcommand] = positional;

	if (command === 'doctor') {
		const project = await loadTentmanProject(getProjectRoot(positional, 1));
		const diagnostics = await doctorTentmanProject(project);
		printDiagnostics('Tentman doctor', diagnostics, { json });
		return getDiagnosticCounts(diagnostics).errors > 0 ? 1 : 0;
	}

	if (command === 'ids' && subcommand === 'check') {
		const project = await loadTentmanProject(getProjectRoot(positional, 2));
		const diagnostics = checkTentmanIds(project);
		printDiagnostics('Tentman ids check', diagnostics, { json });
		return getDiagnosticCounts(diagnostics).errors > 0 ? 1 : 0;
	}

	if (command === 'ids' && subcommand === 'write') {
		const project = await loadTentmanProject(getProjectRoot(positional, 2));
		const changes = await writeMissingTentmanIds(project);
		const summary = summarizeIdWriteChanges(changes);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman ids write', summary, changes }, null, 2));
			return 0;
		}

		console.log('Tentman ids write');
		if (changes.length === 0) {
			console.log('OK, no missing ids.');
			return 0;
		}

		console.log(
			`Wrote ${summary.configs} config id${summary.configs === 1 ? '' : 's'} and ${summary.items} item id${summary.items === 1 ? '' : 's'} across ${summary.files} file${summary.files === 1 ? '' : 's'}.`
		);

		for (const change of changes) {
			console.log(`${change.kind}: ${change.path} -> ${change.id}`);
		}

		return 0;
	}

	if (command === 'nav' && subcommand === 'check') {
		const project = await loadTentmanProject(getProjectRoot(positional, 2));
		const diagnostics = checkNavigationManifest(project);
		printDiagnostics('Tentman nav check', diagnostics, { json });
		return getDiagnosticCounts(diagnostics).errors > 0 ? 1 : 0;
	}

	if (command === 'nav' && subcommand === 'refresh') {
		const project = await loadTentmanProject(getProjectRoot(positional, 2));
		const result = await refreshNavigationManifest(project);
		const summary = summarizeNavigationRefreshChanges(result);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman nav refresh', summary, ...result }, null, 2));
			return 0;
		}

		console.log('Tentman nav refresh');
		if (!result.changed) {
			console.log('OK, no legacy navigation references to refresh.');
			return 0;
		}

		console.log(
			`Updated ${result.path}: ${summary.configs} config reference${summary.configs === 1 ? '' : 's'}, ${summary.collections} collection reference${summary.collections === 1 ? '' : 's'}, ${summary.groups} group reference${summary.groups === 1 ? '' : 's'}, and ${summary.items} item reference${summary.items === 1 ? '' : 's'}.`
		);

		for (const change of result.changes) {
			console.log(`${change.kind}: ${change.from} -> ${change.to}`);
		}

		return 0;
	}

	if (command === 'nav' && subcommand === 'rebuild') {
		const project = await loadTentmanProject(getProjectRoot(positional, 2));
		const result = await rebuildNavigationManifest(project);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman nav rebuild', ...result }, null, 2));
			return 0;
		}

		console.log('Tentman nav rebuild');
		if (!result.changed) {
			console.log('OK, navigation manifest is already rebuilt.');
			return 0;
		}

		console.log(`Rebuilt ${result.path}.`);
		return 0;
	}

	console.error(`Unknown command: ${positional.join(' ')}`);
	printHelp();
	return 1;
}

run()
	.then((exitCode) => {
		process.exitCode = exitCode;
	})
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
