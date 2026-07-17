import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeLoaderFiles = [
	'./[page]/+page.ts',
	'./[page]/edit/+page.ts',
	'./[page]/[itemId]/+page.ts',
	'./[page]/[itemId]/edit/+page.ts'
] as const;

const localEditComponentFiles = [
	'./[page]/edit/+page.svelte',
	'./[page]/[itemId]/edit/+page.svelte'
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

describe('local edit route workflow boundary', () => {
	it('keeps local page and item edit flows behind local route capabilities', () => {
		for (const componentFile of localEditComponentFiles) {
			const filename = fileURLToPath(new URL(componentFile, import.meta.url));
			const source = readFileSync(filename, 'utf8');

			expect(source).toContain('$lib/repository/local-workflow-route-capabilities');
			expect(source).not.toContain('$lib/stores/local-content');
			expect(source).not.toContain('$lib/stores/local-repo');
			expect(source).not.toContain('$lib/content/service');
			expect(source).not.toContain('$lib/repository/local-workflow-data');
		}
	});
});
