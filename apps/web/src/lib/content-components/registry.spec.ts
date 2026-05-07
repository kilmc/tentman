import { describe, expect, it } from 'vitest';
import { loadContentComponentRegistryFromRepository } from './registry';

function createRepository(files: Record<string, string>) {
	return {
		async fileExists(path: string) {
			return Object.keys(files).some((filePath) => filePath === path || filePath.startsWith(`${path}/`));
		},
		async listDirectory(path: string) {
			const childDirectories = new Set<string>();

			for (const filePath of Object.keys(files)) {
				if (!filePath.startsWith(`${path}/`)) {
					continue;
				}

				const remainder = filePath.slice(path.length + 1);
				const directory = remainder.split('/')[0];

				if (directory) {
					childDirectories.add(directory);
				}
			}

			return Array.from(childDirectories).sort().map((directory) => ({
				name: directory,
				path: `${path}/${directory}`,
				kind: 'directory' as const
			}));
		},
		async readTextFile(path: string) {
			const file = files[path];

			if (file === undefined) {
				throw new Error(`Missing file: ${path}`);
			}

			return file;
		}
	};
}

describe('loadContentComponentRegistryFromRepository', () => {
	it('loads and validates discovered content components', async () => {
		const registry = await loadContentComponentRegistryFromRepository(
			createRepository({
				'src/lib/content-components/buy-button/component.json': JSON.stringify({
					id: 'buy-button',
					name: 'buy-button',
					kind: 'inline',
					attributes: {
						href: { type: 'string', required: true },
						label: { type: 'string', required: true, valueFromMarkdownLabel: true }
					}
				}),
				'src/lib/content-components/buy-button/render.njk': '<a>{{ label }}</a>',
				'src/lib/content-components/buy-button/preview.njk':
					'<span>Buy button: {{ label }}</span>'
			})
		);

		expect(registry.components).toHaveLength(1);
		expect(registry.getByName('buy-button')?.definition.id).toBe('buy-button');
		expect(registry.errors).toEqual([]);
	});

	it('returns empty registry when the components directory is missing', async () => {
		const registry = await loadContentComponentRegistryFromRepository(createRepository({}));

		expect(registry.components).toEqual([]);
		expect(registry.errors).toEqual([]);
	});
});
