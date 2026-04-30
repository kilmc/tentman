#!/usr/bin/env node
import {
	checkTentmanAssets,
	checkTentmanFormat,
	checkTentmanIds,
	checkNavigationManifest,
	doctorTentmanProject,
	explainTentmanNavigation,
	findUnusedTentmanAssets,
	getTentmanSchema,
	inspectTentmanContent,
	listTentmanAssets,
	listTentmanContent,
	loadTentmanProject,
	printTentmanNavigation,
	rebuildNavigationManifest,
	refreshNavigationManifest,
	runTentmanCi,
	summarizeFormatCheck,
	summarizeIdWriteChanges,
	summarizeNavigationRefreshChanges,
	writeTentmanFormat,
	writeMissingTentmanIds
} from '@tentman/core';
import path from 'node:path';

function printHelp() {
	console.log(`Tentman CLI

Usage:
  tentman doctor [project-root]
  tentman assets check [project-root]
  tentman assets list [config-reference] [project-root]
  tentman assets unused [config-reference] [project-root]
  tentman ci [project-root]
  tentman content list [config-reference] [project-root]
  tentman content inspect <config-reference> [item-reference] [project-root]
  tentman schema [config-reference] [project-root]
  tentman ids check [project-root]
  tentman ids write [project-root]
  tentman nav check [project-root]
  tentman nav explain <config-reference> [item-reference] [project-root]
  tentman nav print [config-reference] [project-root]
  tentman nav refresh [project-root]
  tentman nav rebuild [project-root]
  tentman format --check [project-root]
  tentman format --write [project-root]

Options:
  --check     Check formatting without writing files
  --write     Write Tentman-owned formatting rewrites
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

function looksLikeProjectRoot(value) {
	return (
		typeof value === 'string' &&
		(value === '.' ||
			value === '..' ||
			value.startsWith('./') ||
			value.startsWith('../') ||
			path.isAbsolute(value) ||
			value.includes('/') ||
			value.includes(path.sep))
	);
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

	if (command === 'assets' && subcommand === 'check') {
		const project = await loadTentmanProject(getProjectRoot(positional, 2));
		const diagnostics = await checkTentmanAssets(project);
		printDiagnostics('Tentman assets check', diagnostics, { json });
		return getDiagnosticCounts(diagnostics).errors > 0 ? 1 : 0;
	}

	if (command === 'assets' && subcommand === 'list') {
		const selector = positional[2] && !looksLikeProjectRoot(positional[2]) ? positional[2] : undefined;
		const project = await loadTentmanProject(getProjectRoot(positional, selector ? 3 : 2));
		const assets = await listTentmanAssets(project, selector);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman assets list', assets }, null, 2));
			return 0;
		}

		console.log('Tentman assets list');

		if (Array.isArray(assets)) {
			for (const entry of assets) {
				console.log(
					`${entry.kind}: ${entry.label} (${entry.reference ?? 'no-reference'}) -> ${entry.assetCount} asset reference${entry.assetCount === 1 ? '' : 's'} in ${entry.contentPath}`
				);
			}
			return 0;
		}

		console.log(
			`${assets.config.kind}: ${assets.config.label} (${assets.config.reference ?? 'no-reference'}) -> ${assets.config.assetCount} asset reference${assets.config.assetCount === 1 ? '' : 's'} in ${assets.config.contentPath}`
		);

		for (const item of assets.items) {
			if (item.assets.length === 0) {
				continue;
			}

			console.log(`\n${item.reference ?? `item-${item.index + 1}`}: ${item.label}${item.path ? ` (${item.path})` : ''}`);
			for (const asset of item.assets) {
				const status =
					asset.matchesExpectedPath === false
						? 'MISMATCH'
						: asset.exists === false
							? 'MISSING'
							: 'OK';
				console.log(`  ${asset.fieldPath}: ${asset.value} [${status}]`);
			}
		}

		return 0;
	}

	if (command === 'assets' && subcommand === 'unused') {
		const selector = positional[2] && !looksLikeProjectRoot(positional[2]) ? positional[2] : undefined;
		const project = await loadTentmanProject(getProjectRoot(positional, selector ? 3 : 2));
		const unused = await findUnusedTentmanAssets(project, selector);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman assets unused', unused }, null, 2));
			return 0;
		}

		console.log('Tentman assets unused');

		if (Array.isArray(unused)) {
			for (const entry of unused) {
				const owners = entry.configs.map((config) => config.label).join(', ');
				console.log(
					`${entry.path} (${entry.expectedPrefix ?? 'no-public-prefix'}) -> ${entry.unusedCount} unused file${entry.unusedCount === 1 ? '' : 's'} across ${owners}`
				);
			}
			return 0;
		}

		console.log(
			`${unused.config.kind}: ${unused.config.label} (${unused.config.reference ?? 'no-reference'}) -> ${unused.unusedFiles.length} unused file${unused.unusedFiles.length === 1 ? '' : 's'}`
		);

		for (const directory of unused.directories) {
			console.log(`\n${directory.path} (${directory.expectedPrefix ?? 'no-public-prefix'})`);

			if (directory.unusedFiles.length === 0) {
				console.log('  OK');
				continue;
			}

			for (const file of directory.unusedFiles) {
				console.log(`  ${file}`);
			}
		}

		return 0;
	}

	if (command === 'ci') {
		const project = await loadTentmanProject(getProjectRoot(positional, 1));
		const result = await runTentmanCi(project);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman ci', ...result }, null, 2));
			return result.summary.errors > 0 ? 1 : 0;
		}

		console.log('Tentman ci');

		for (const check of result.checks) {
			if (check.id === 'format') {
				if (check.rewrites.length === 0) {
					console.log(`${check.title}: OK`);
					continue;
				}

				console.log(
					`${check.title}: would rewrite ${check.summary.files} file${check.summary.files === 1 ? '' : 's'}`
				);
				for (const rewrite of check.rewrites) {
					const owner = rewrite.kind === 'content' ? ` (${rewrite.configPath})` : '';
					console.log(`  ${rewrite.kind}: ${rewrite.path}${owner}`);
				}
				continue;
			}

			if (check.diagnostics.length === 0) {
				console.log(`${check.title}: OK`);
				continue;
			}

			console.log(
				`${check.title}: ${check.errors} error${check.errors === 1 ? '' : 's'}, ${check.warnings} warning${check.warnings === 1 ? '' : 's'}`
			);
			for (const diagnostic of check.diagnostics) {
				const location = diagnostic.path ? ` (${diagnostic.path})` : '';
				console.log(
					`  ${diagnostic.level.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}${location}`
				);
			}
		}

		console.log(
			`\n${result.summary.errors} total error${result.summary.errors === 1 ? '' : 's'}, ${result.summary.warnings} total warning${result.summary.warnings === 1 ? '' : 's'}`
		);
		return result.summary.errors > 0 ? 1 : 0;
	}

	if (command === 'content' && subcommand === 'list') {
		const selector = positional[2] && !looksLikeProjectRoot(positional[2]) ? positional[2] : undefined;
		const project = await loadTentmanProject(
			getProjectRoot(positional, selector ? 3 : 2)
		);
		const content = listTentmanContent(project, selector);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman content list', content }, null, 2));
			return 0;
		}

		console.log('Tentman content list');

		if (Array.isArray(content)) {
			for (const entry of content) {
				console.log(
					`${entry.kind}: ${entry.label} (${entry.reference ?? 'no-reference'}) -> ${entry.itemCount} item${entry.itemCount === 1 ? '' : 's'} in ${entry.contentPath}`
				);
			}
			return 0;
		}

		console.log(
			`${content.config.kind}: ${content.config.label} (${content.config.reference ?? 'no-reference'}) -> ${content.items.length} item${content.items.length === 1 ? '' : 's'} in ${content.config.contentPath}`
		);

		for (const item of content.items) {
			console.log(`${item.reference ?? `item-${item.index + 1}`}: ${item.label}${item.path ? ` (${item.path})` : ''}`);
		}

		return 0;
	}

	if (command === 'content' && subcommand === 'inspect') {
		const configReference = positional[2];

		if (!configReference) {
			throw new Error('content inspect requires a config reference');
		}

		const itemReference =
			positional[3] && !looksLikeProjectRoot(positional[3]) ? positional[3] : undefined;
		const project = await loadTentmanProject(
			getProjectRoot(positional, itemReference ? 4 : 3)
		);
		const content = inspectTentmanContent(project, configReference, itemReference);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman content inspect', content }, null, 2));
			return 0;
		}

		console.log('Tentman content inspect');
		console.log(
			`${content.config.kind}: ${content.config.label} (${content.config.reference ?? 'no-reference'})`
		);
		console.log(
			`${content.item.reference ?? `item-${content.item.index + 1}`}: ${content.item.label}${content.item.path ? ` (${content.item.path})` : ''}`
		);
		return 0;
	}

	if (command === 'schema') {
		const selector = positional[1] && !looksLikeProjectRoot(positional[1]) ? positional[1] : undefined;
		const project = await loadTentmanProject(getProjectRoot(positional, selector ? 2 : 1));
		const schema = getTentmanSchema(project, selector);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman schema', schema }, null, 2));
			return 0;
		}

		console.log('Tentman schema');

		if (Array.isArray(schema)) {
			for (const entry of schema) {
				console.log(
					`${entry.kind}: ${entry.label} (${entry.reference ?? 'no-reference'}) -> ${entry.blockCount} field${entry.blockCount === 1 ? '' : 's'} in ${entry.contentMode} content`
				);
			}
			return 0;
		}

		console.log(
			`${schema.config.kind}: ${schema.config.label} (${schema.config.reference ?? 'no-reference'})`
		);
		console.log(
			`content: ${schema.config.content.mode} -> ${schema.config.content.path}${schema.config.content.template ? ` (template ${schema.config.content.template})` : ''}`
		);

		if (schema.config.collection.enabled) {
			console.log(
				`collection: ${schema.config.collection.itemLabel ?? 'item'} via ${schema.config.collection.idField ?? 'no idField'}`
			);
		}

		console.log('\nFields');

		function printField(field, indent = '') {
			const collection = field.collection ? '[]' : '';
			const detail =
				field.schemaKind === 'reusable-block'
					? ` -> ${field.reusableBlock?.label ?? field.type}`
					: '';
			console.log(`${indent}${field.id ?? 'unknown'}: ${field.type ?? 'unknown'}${collection}${detail}`);

			for (const nestedField of field.fields ?? []) {
				printField(nestedField, `${indent}  `);
			}
		}

		for (const field of schema.fields) {
			printField(field);
		}

		return 0;
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
			`Wrote ${summary.configs} config id${summary.configs === 1 ? '' : 's'}, ${summary.groups} group id${summary.groups === 1 ? '' : 's'}, and ${summary.items} item id${summary.items === 1 ? '' : 's'} across ${summary.files} file${summary.files === 1 ? '' : 's'}.`
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

	if (command === 'nav' && subcommand === 'print') {
		const selector = positional[2] && !looksLikeProjectRoot(positional[2]) ? positional[2] : undefined;
		const project = await loadTentmanProject(getProjectRoot(positional, selector ? 3 : 2));
		const navigation = printTentmanNavigation(project, selector);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman nav print', navigation }, null, 2));
			return 0;
		}

		console.log('Tentman nav print');

		if (!selector) {
			for (const entry of navigation.content) {
				console.log(`${entry.label} (${entry.reference ?? 'no-reference'})`);
			}
			return 0;
		}

		console.log(
			`${navigation.config.label} (${navigation.config.reference ?? 'no-reference'})`
		);

		for (const item of navigation.items) {
			console.log(`${item.reference ?? `item-${item.index + 1}`}: ${item.label}`);
		}

		if (navigation.groups.length > 0) {
			console.log('\nGroups');
			for (const group of navigation.groups) {
				console.log(`${group.label} (${group.id})`);
				for (const item of group.items) {
					console.log(`  ${item.reference ?? `item-${item.index + 1}`}: ${item.label}`);
				}
			}
		}

		return 0;
	}

	if (command === 'nav' && subcommand === 'explain') {
		const configReference = positional[2];

		if (!configReference) {
			throw new Error('nav explain requires a config reference');
		}

		const itemReference =
			positional[3] && !looksLikeProjectRoot(positional[3]) ? positional[3] : undefined;
		const project = await loadTentmanProject(getProjectRoot(positional, itemReference ? 4 : 3));
		const explanation = explainTentmanNavigation(project, configReference, itemReference);

		if (json) {
			console.log(JSON.stringify({ title: 'Tentman nav explain', explanation }, null, 2));
			return 0;
		}

		console.log('Tentman nav explain');
		console.log(
			`${explanation.config.label} (${explanation.config.reference ?? 'no-reference'}) is at top-level position ${explanation.config.topLevelIndex + 1} via ${explanation.config.topLevelSource}.`
		);

		if (explanation.item) {
			const groupText = explanation.item.group
				? ` and group ${explanation.item.group.label}`
				: '';
			console.log(
				`${explanation.item.label} (${explanation.item.reference ?? 'no-reference'}) is at collection position ${explanation.item.index + 1} via ${explanation.item.orderSource}${groupText}.`
			);
		}

		return 0;
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

	if (command === 'format' && (flags.has('--check') || subcommand === 'check')) {
		const project = await loadTentmanProject(getProjectRoot(positional, subcommand === 'check' ? 2 : 1));
		const rewrites = await checkTentmanFormat(project);
		const summary = summarizeFormatCheck(rewrites);

		if (json) {
			console.log(
				JSON.stringify(
					{
						title: 'Tentman format --check',
						summary,
						rewrites
					},
					null,
					2
				)
			);
			return rewrites.length > 0 ? 1 : 0;
		}

		console.log('Tentman format --check');

		if (rewrites.length === 0) {
			console.log('OK, no Tentman-owned formatting rewrites detected.');
			return 0;
		}

		console.log(
			`Would rewrite ${summary.files} file${summary.files === 1 ? '' : 's'} using current Tentman serializers. This is a diagnostic check for formatting churn, not a blanket normalization rule.`
		);

		for (const rewrite of rewrites) {
			const owner = rewrite.kind === 'content' ? ` (${rewrite.configPath})` : '';
			console.log(`${rewrite.kind}: ${rewrite.path}${owner}`);
		}

		return 1;
	}

	if (command === 'format' && (flags.has('--write') || subcommand === 'write')) {
		const project = await loadTentmanProject(getProjectRoot(positional, subcommand === 'write' ? 2 : 1));
		const rewrites = await writeTentmanFormat(project);
		const summary = summarizeFormatCheck(rewrites);

		if (json) {
			console.log(
				JSON.stringify(
					{
						title: 'Tentman format --write',
						summary,
						rewrites
					},
					null,
					2
				)
			);
			return 0;
		}

		console.log('Tentman format --write');

		if (rewrites.length === 0) {
			console.log('OK, no Tentman-owned formatting rewrites were needed.');
			return 0;
		}

		console.log(
			`Wrote ${summary.files} file${summary.files === 1 ? '' : 's'} using current Tentman serializers.`
		);

		for (const rewrite of rewrites) {
			const owner = rewrite.kind === 'content' ? ` (${rewrite.configPath})` : '';
			console.log(`${rewrite.kind}: ${rewrite.path}${owner}`);
		}

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
