import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const routesDirectory = new URL('.', import.meta.url).pathname;

const validRouteExportsByFileName = new Map<string, Set<string>>([
	['+layout.ts', new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'])],
	['+layout.js', new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'])],
	['+page.ts', new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config', 'entries'])],
	['+page.js', new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config', 'entries'])],
	['+layout.server.ts', new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'])],
	['+layout.server.js', new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'])],
	[
		'+page.server.ts',
		new Set(['load', 'actions', 'entries', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'])
	],
	[
		'+page.server.js',
		new Set(['load', 'actions', 'entries', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'])
	],
	[
		'+server.ts',
		new Set([
			'GET',
			'POST',
			'PATCH',
			'PUT',
			'DELETE',
			'OPTIONS',
			'HEAD',
			'fallback',
			'prerender',
			'trailingSlash',
			'config',
			'entries'
		])
	],
	[
		'+server.js',
		new Set([
			'GET',
			'POST',
			'PATCH',
			'PUT',
			'DELETE',
			'OPTIONS',
			'HEAD',
			'fallback',
			'prerender',
			'trailingSlash',
			'config',
			'entries'
		])
	]
]);

type RuntimeExport = {
	file: string;
	name: string;
};

async function listRouteModules(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const routeModules = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);

			if (entry.isDirectory()) {
				return listRouteModules(path);
			}

			return validRouteExportsByFileName.has(entry.name) ? [path] : [];
		})
	);

	return routeModules.flat();
}

function hasExportModifier(node: ts.Node): boolean {
	return (
		ts.canHaveModifiers(node) &&
		(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
	);
}

function collectRuntimeExports(sourceFile: ts.SourceFile): string[] {
	const exports: string[] = [];

	for (const statement of sourceFile.statements) {
		if (ts.isExportDeclaration(statement)) {
			if (statement.isTypeOnly || !statement.exportClause) {
				continue;
			}

			if (ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					if (!element.isTypeOnly) {
						exports.push(element.name.text);
					}
				}
			}
			continue;
		}

		if (!hasExportModifier(statement)) {
			continue;
		}

		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name)) {
					exports.push(declaration.name.text);
				}
			}
			continue;
		}

		if (
			(ts.isFunctionDeclaration(statement) ||
				ts.isClassDeclaration(statement) ||
				ts.isEnumDeclaration(statement)) &&
			statement.name
		) {
			exports.push(statement.name.text);
		}
	}

	return exports;
}

describe('SvelteKit route exports', () => {
	it('keeps route module runtime exports within SvelteKit valid names', async () => {
		const invalidExports: RuntimeExport[] = [];

		for (const filePath of await listRouteModules(routesDirectory)) {
			const allowedExports = validRouteExportsByFileName.get(basename(filePath));
			const source = await readFile(filePath, 'utf8');
			const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

			for (const name of collectRuntimeExports(sourceFile)) {
				if (!name.startsWith('_') && !allowedExports?.has(name)) {
					invalidExports.push({
						file: relative(routesDirectory, filePath),
						name
					});
				}
			}
		}

		expect(invalidExports).toEqual([]);
	});
});
