import { describe, expect, it } from 'vitest';
import {
	discoverInstructions,
	parseInstructionDefinition,
	parseInstructionTemplate
} from '$lib/features/instructions/discovery';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import type {
	RepoEntry,
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

function createBackend(files: Record<string, string>): RepositoryBackend {
	async function listDirectory(path: string): Promise<RepoEntry[]> {
		const normalized = path.replace(/\/$/, '');
		const children = new Map<string, RepoEntry>();

		for (const filePath of Object.keys(files)) {
			if (!filePath.startsWith(`${normalized}/`)) {
				continue;
			}

			const remainder = filePath.slice(normalized.length + 1);
			if (remainder.length === 0) {
				continue;
			}

			const [name, ...rest] = remainder.split('/');
			const childPath = `${normalized}/${name}`;
			children.set(childPath, {
				name,
				path: childPath,
				kind: rest.length > 0 ? 'directory' : 'file'
			});
		}

		if (children.size === 0) {
			throw new Error(`Missing directory: ${path}`);
		}

		return [...children.values()].sort((left, right) => left.path.localeCompare(right.path));
	}

	return {
		kind: 'local',
		cacheKey: 'local:test',
		label: 'Local test',
		supportsDraftBranches: false,
		async discoverConfigs() {
			return [];
		},
		async discoverBlockConfigs() {
			return [];
		},
		async readRootConfig() {
			return null;
		},
		async readTextFile(path: string, _options?: RepositoryReadOptions) {
			const value = files[path];
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}

			return value;
		},
		async writeTextFile(_path: string, _content: string, _options?: RepositoryWriteOptions) {},
		async writeBinaryFile(
			_path: string,
			_content: Uint8Array,
			_options?: RepositoryWriteOptions
		) {},
		async deleteFile(_path: string, _options?: RepositoryWriteOptions) {},
		listDirectory,
		async fileExists(path: string) {
			return (
				path in files ||
				Object.keys(files).some((filePath) => filePath.startsWith(`${path.replace(/\/$/, '')}/`))
			);
		}
	};
}

describe('instruction discovery', () => {
	it('parses the instruction definition contract', () => {
		expect(
			parseInstructionDefinition(
				JSON.stringify({
					id: 'create-page',
					label: 'Create page',
					description: 'Scaffold a page.',
					inputs: [
						{
							id: 'slug',
							type: 'slug',
							label: 'Slug',
							required: true
						},
						{
							id: 'showInNavigation',
							type: 'boolean',
							label: 'Show in navigation',
							defaultValue: true
						},
						{
							id: 'layout',
							type: 'select',
							label: 'Layout',
							options: [{ value: 'default', label: 'Default' }]
						}
					],
					confirmation: {
						title: 'Create {{slug}}',
						summary: [
							'This will create a page at /{{slug}}.',
							{
								text: 'This page will show in navigation.',
								if: '{{showInNavigation}}'
							}
						]
					}
				})
			)
		).toMatchObject({
			id: 'create-page',
			inputs: [
				{ id: 'slug', type: 'slug', required: true },
				{ id: 'showInNavigation', type: 'boolean', defaultValue: true },
				{ id: 'layout', type: 'select', options: [{ value: 'default', label: 'Default' }] }
			]
		});
	});

	it('parses template frontmatter with destination and collision flags', () => {
		expect(
			parseInstructionTemplate(
				`---
to: src/routes/{{slug}}/+page.svelte
if: "{{withPageRoute}}"
skip_if_exists: true
---
<h1>{{title}}</h1>
`,
				'tentman/instructions/create-page/templates/page.tmpl'
			)
		).toEqual({
			sourcePath: 'tentman/instructions/create-page/templates/page.tmpl',
			destinationPathTemplate: 'src/routes/{{slug}}/+page.svelte',
			condition: '{{withPageRoute}}',
			skipIfExists: true,
			body: '<h1>{{title}}</h1>\n'
		});
	});

	it('discovers valid instructions and reports invalid ones without stopping the rest', async () => {
		const result = await discoverInstructions(
			createBackend({
				'tentman/instructions/create-page/instruction.json': JSON.stringify({
					id: 'create-page',
					label: 'Create page',
					description: 'Scaffold a new page.',
					inputs: [{ id: 'slug', type: 'slug', label: 'Slug', required: true }]
				}),
				'tentman/instructions/create-page/templates/page.tmpl': `---
to: src/routes/{{slug}}/+page.svelte
---
<h1>{{slug}}</h1>
`,
				'tentman/instructions/broken/instruction.json': JSON.stringify({
					id: 'broken',
					label: 'Broken',
					description: 'Broken instruction',
					inputs: [{ id: 'flag', type: 'wat', label: 'Flag' }]
				})
			})
		);

		expect(result.instructions).toMatchObject([
			{
				path: 'tentman/instructions/create-page',
				definition: {
					id: 'create-page',
					label: 'Create page',
					description: 'Scaffold a new page.',
					inputs: [{ id: 'slug', type: 'slug', label: 'Slug', required: true }]
				},
				templates: [
					{
						sourcePath: 'tentman/instructions/create-page/templates/page.tmpl',
						destinationPathTemplate: 'src/routes/{{slug}}/+page.svelte',
						skipIfExists: false,
						body: '<h1>{{slug}}</h1>\n'
					}
				]
			}
		]);
		expect(result.issues).toEqual<InstructionDiscoveryResult['issues']>([
			{
				path: 'tentman/instructions/broken/instruction.json',
				message: 'inputs[0].type must be one of text, slug, boolean, or select'
			}
		]);
	});
});
