import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeLoaderFiles = [
	'./[page]/+page.ts',
	'./[page]/edit/+page.ts',
	'./[page]/[itemId]/+page.ts',
	'./[page]/[itemId]/edit/+page.ts'
] as const;

describe('GitHub page route loader workflow boundary', () => {
	it('keeps page and item loaders behind workflow route capabilities', () => {
		for (const routeLoaderFile of routeLoaderFiles) {
			const filename = fileURLToPath(new URL(routeLoaderFile, import.meta.url));
			const source = readFileSync(filename, 'utf8');

			expect(source).not.toContain('$lib/stores/github-repository-cache');
			expect(source).toContain('$lib/repository/github-workflow-route-capabilities');
		}
	});
});
