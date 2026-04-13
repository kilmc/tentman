import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import { planInstructionExecution, normalizeSlug } from '$lib/features/instructions/planner';
import type { DiscoveredInstruction } from '$lib/features/instructions/types';
import type {
	RepoEntry,
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

function createBackend(files: Record<string, string>): RepositoryBackend {
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
		async listDirectory(_path: string): Promise<RepoEntry[]> {
			return [];
		},
		async fileExists(path: string) {
			return path in files;
		}
	};
}

function createNodeFsBackend(rootPath: string): RepositoryBackend {
	return {
		kind: 'local',
		cacheKey: `local:${rootPath}`,
		label: 'Local node fs test',
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
		async readTextFile(path: string) {
			return await readFile(join(rootPath, path), 'utf8');
		},
		async writeTextFile() {},
		async writeBinaryFile() {},
		async deleteFile() {},
		async listDirectory(path: string): Promise<RepoEntry[]> {
			const absolutePath = join(rootPath, path);
			const entries = await readdir(absolutePath, { withFileTypes: true });
			return entries
				.map((entry) => ({
					name: entry.name,
					path: path === '.' ? entry.name : `${path}/${entry.name}`,
					kind: entry.isDirectory() ? ('directory' as const) : ('file' as const)
				}))
				.sort((left, right) => left.path.localeCompare(right.path));
		},
		async fileExists(path: string) {
			try {
				await readFile(join(rootPath, path), 'utf8');
				return true;
			} catch {
				try {
					await readdir(join(rootPath, path));
					return true;
				} catch {
					return false;
				}
			}
		}
	};
}

const createPageInstruction: DiscoveredInstruction = {
	path: 'tentman/instructions/create-page',
	definition: {
		id: 'create-page',
		label: 'Create page',
		description: 'Scaffold a new page.',
		inputs: [
			{ id: 'title', type: 'text', label: 'Page title', required: true },
			{ id: 'slug', type: 'slug', label: 'URL slug', required: true },
			{
				id: 'showInNavigation',
				type: 'boolean',
				label: 'Show in navigation',
				defaultValue: true
			}
		],
		navigation: {
			enabled: '{{showInNavigation}}',
			addItem: '{{slug}}'
		},
		confirmation: {
			title: 'Create {{title}}',
			summary: [
				{
					text: 'This will create a new page at /{{slug}}.'
				},
				{
					text: 'This page will be added to Tentman navigation.',
					if: '{{showInNavigation}}'
				}
			]
		},
		notes: [
			{
				text: 'Review the generated files before applying them.'
			}
		]
	},
	templates: [
		{
			sourcePath: 'tentman/instructions/create-page/templates/config.tmpl',
			destinationPathTemplate: 'tentman/configs/{{slug}}.tentman.json',
			skipIfExists: false,
			body: '{"id":"{{slug}}","label":"{{title}}"}\n'
		},
		{
			sourcePath: 'tentman/instructions/create-page/templates/route.tmpl',
			destinationPathTemplate: 'src/routes/{{slug}}/+page.svelte',
			skipIfExists: true,
			body: '<h1>{{title}}</h1>\n'
		}
	]
};

describe('instruction planner', () => {
	it('normalizes slug input values', () => {
		expect(normalizeSlug(' Press Kit ')).toBe('press-kit');
	});

	it('builds a local execution plan with file previews and navigation changes', async () => {
		const plan = await planInstructionExecution(
			createBackend({
				'tentman/navigation-manifest.json': JSON.stringify({
					version: 1,
					content: {
						items: ['about']
					}
				}),
				'src/routes/press-kit/+page.svelte': '<h1>Existing page</h1>\n'
			}),
			createPageInstruction,
			{
				title: 'Press Kit',
				slug: 'Press Kit',
				showInNavigation: true
			}
		);

		expect(plan).toEqual({
			instructionId: 'create-page',
			instructionLabel: 'Create page',
			inputValues: {
				title: 'Press Kit',
				slug: 'press-kit',
				showInNavigation: true
			},
			confirmationTitle: 'Create Press Kit',
			confirmationSummary: [
				'This will create a new page at /press-kit.',
				'This page will be added to Tentman navigation.'
			],
			notes: ['Review the generated files before applying them.'],
			files: [
				{
					path: 'src/routes/press-kit/+page.svelte',
					content: '<h1>Press Kit</h1>\n',
					sourceTemplatePath: 'tentman/instructions/create-page/templates/route.tmpl',
					status: 'skip-existing',
					reason: 'Skipped because the target file already exists.'
				},
				{
					path: 'tentman/configs/press-kit.tentman.json',
					content: '{"id":"press-kit","label":"Press Kit"}\n',
					sourceTemplatePath: 'tentman/instructions/create-page/templates/config.tmpl',
					status: 'create',
					reason: null
				}
			],
			navigationChange: {
				path: 'tentman/navigation-manifest.json',
				status: 'append-item',
				configId: 'press-kit',
				summary: 'Tentman will append this item to the existing navigation manifest.',
				nextManifest: {
					version: 1,
					content: {
						items: ['about', 'press-kit']
					}
				}
			},
			inputErrors: [],
			planErrors: []
		});
	});

	it('surfaces collisions and input validation errors', async () => {
		const plan = await planInstructionExecution(
			createBackend({
				'tentman/configs/press-kit.tentman.json': '{}\n'
			}),
			createPageInstruction,
			{
				title: '',
				slug: '',
				showInNavigation: false
			}
		);

		expect(plan.inputErrors).toEqual([
			{
				inputId: 'title',
				message: 'Page title is required.'
			},
			{
				inputId: 'slug',
				message: 'URL slug is required.'
			}
		]);
		expect(plan.files).toEqual([]);
		expect(plan.navigationChange).toBeNull();
	});

	it('creates a new navigation manifest when none exists yet', async () => {
		const plan = await planInstructionExecution(createBackend({}), createPageInstruction, {
			title: 'Press Kit',
			slug: 'press-kit',
			showInNavigation: true
		});

		expect(plan.navigationChange).toEqual({
			path: 'tentman/navigation-manifest.json',
			status: 'create-manifest',
			configId: 'press-kit',
			summary: 'Tentman will create a navigation manifest and add this item.',
			nextManifest: {
				version: 1,
				content: {
					items: ['press-kit']
				}
			}
		});
	});

	it('uses navigation fallback confirmation copy for navigation-only instructions', async () => {
		const plan = await planInstructionExecution(
			createBackend({}),
			{
				path: 'tentman/instructions/add-nav-item',
				definition: {
					id: 'add-nav-item',
					label: 'Add nav item',
					description: 'Adds an existing config to navigation.',
					inputs: [{ id: 'configId', type: 'text', label: 'Config id', required: true }],
					navigation: {
						enabled: true,
						addItem: '{{configId}}'
					}
				},
				templates: []
			},
			{
				configId: 'press-kit'
			}
		);

		expect(plan.confirmationSummary).toEqual([
			'Tentman will create a navigation manifest and add this item.'
		]);
	});

	it('includes fallback conflict guidance when confirmation copy is omitted', async () => {
		const plan = await planInstructionExecution(
			createBackend({
				'tentman/configs/press-kit.tentman.json': '{}\n'
			}),
			{
				...createPageInstruction,
				definition: {
					...createPageInstruction.definition,
					confirmation: undefined
				},
				templates: [
					{
						sourcePath: 'tentman/instructions/create-page/templates/config.tmpl',
						destinationPathTemplate: 'tentman/configs/{{slug}}.tentman.json',
						skipIfExists: false,
						body: '{"id":"{{slug}}","label":"{{title}}"}\n'
					}
				]
			},
			{
				title: 'Press Kit',
				slug: 'press-kit',
				showInNavigation: false
			}
		);

		expect(plan.confirmationSummary).toEqual([
			'Some target files already exist and need your review before Tentman can apply.'
		]);
		expect(plan.planErrors).toEqual(['tentman/configs/press-kit.tentman.json already exists.']);
	});

	it('flags duplicate template destinations as plan errors', async () => {
		const plan = await planInstructionExecution(
			createBackend({}),
			{
				path: 'tentman/instructions/create-page',
				definition: {
					id: 'create-page',
					label: 'Create page',
					description: 'Scaffold a page.',
					inputs: [{ id: 'slug', type: 'slug', label: 'URL slug', required: true }]
				},
				templates: [
					{
						sourcePath: 'templates/page-a.tmpl',
						destinationPathTemplate: 'src/routes/{{slug}}/+page.svelte',
						skipIfExists: false,
						body: '<h1>A</h1>\n'
					},
					{
						sourcePath: 'templates/page-b.tmpl',
						destinationPathTemplate: 'src/routes/{{slug}}/+page.svelte',
						skipIfExists: false,
						body: '<h1>B</h1>\n'
					}
				]
			},
			{
				slug: 'news'
			}
		);

		expect(plan.files).toEqual([
			{
				path: 'src/routes/news/+page.svelte',
				content: '<h1>A</h1>\n',
				sourceTemplatePath: 'templates/page-a.tmpl',
				status: 'create',
				reason: null
			},
			{
				path: 'src/routes/news/+page.svelte',
				content: '<h1>B</h1>\n',
				sourceTemplatePath: 'templates/page-b.tmpl',
				status: 'conflict',
				reason: 'Another template in this instruction already targets this path.'
			}
		]);
		expect(plan.planErrors).toEqual([
			'src/routes/news/+page.svelte is targeted by more than one template in this instruction.'
		]);
	});

	it('plans the real fixture instruction without duplicate output paths', async () => {
		const fixtureRoot = '/Users/kilmc/code/tentman/test-app';
		const backend = createNodeFsBackend(fixtureRoot);
		const discovery = await discoverInstructions(backend);
		const instruction = discovery.instructions.find(
			(candidate) => candidate.definition.id === 'create-page'
		);

		expect(instruction).toBeTruthy();

		const plan = await planInstructionExecution(backend, instruction!, {
			title: 'News',
			slug: 'news',
			showInNavigation: true
		});

		expect(plan.files.map((file) => file.path)).toEqual([
			'src/content/pages/news.json',
			'src/routes/news/+page.server.ts',
			'src/routes/news/+page.svelte',
			'tentman/configs/news.tentman.json'
		]);
		expect(plan.planErrors).toEqual([]);
	});
});
