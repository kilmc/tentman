import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { planInstructionExecution } from '$lib/features/instructions/planner';
import { applyInstructionExecutionPlan } from '$lib/features/instructions/execution';
import type {
	DiscoveredInstruction,
	InstructionDiscoveryResult
} from '$lib/features/instructions/types';
import type { InstructionsWorkspaceServices } from '$lib/features/instructions/InstructionsWorkspace.svelte';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		},
		get() {
			return value;
		}
	};
}

const instructionsPageMocks = vi.hoisted(() => {
	const files: Record<string, string> = {
		'tentman/instructions/create-page/instruction.json': JSON.stringify({
			id: 'create-page',
			label: 'Create page',
			description: 'Scaffold a simple page.',
			inputs: [
				{
					id: 'title',
					type: 'text',
					label: 'Page title',
					required: true
				},
				{
					id: 'slug',
					type: 'slug',
					label: 'URL slug',
					required: true
				},
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
			}
		}),
		'tentman/instructions/create-page/templates/config.tmpl': `---
to: tentman/configs/{{slug}}.tentman.json
---
{"id":"{{slug}}","label":"{{title}}"}
`,
		'tentman/instructions/create-page/templates/route.tmpl': `---
to: src/routes/{{slug}}/+page.svelte
skip_if_exists: true
---
<h1>{{title}}</h1>
`,
		'tentman/navigation-manifest.json': JSON.stringify({
			version: 1,
			content: {
				items: ['about']
			}
		}),
		'src/routes/press-kit/+page.svelte': '<h1>Existing page</h1>\n'
	};

	async function listDirectory(path: string) {
		const normalized = path.replace(/\/$/, '');
		const children = new Map<string, { name: string; path: string; kind: 'file' | 'directory' }>();

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

		return [...children.values()].sort((left, right) => left.path.localeCompare(right.path));
	}

	const backend = {
		kind: 'local' as const,
		cacheKey: 'local:docs',
		label: 'Local docs',
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
			const value = files[path];
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}

			return value;
		},
		async writeTextFile(path: string, content: string) {
			files[path] = content;
		},
		async writeBinaryFile() {},
		async deleteFile(path: string) {
			delete files[path];
		},
		listDirectory,
		async fileExists(path: string) {
			return (
				path in files ||
				Object.keys(files).some((filePath) => filePath.startsWith(`${path.replace(/\/$/, '')}/`))
			);
		}
	};

	const localRepoStore = createStoreState({
		status: 'ready' as const,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		backend,
		error: null
	});

	return {
		files,
		backend,
		localRepoStore,
		hydrate: vi.fn(async () => {}),
		invalidateAll: vi.fn(async () => {})
	};
});

vi.mock('$app/navigation', () => ({
	invalidateAll: instructionsPageMocks.invalidateAll
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: instructionsPageMocks.localRepoStore.subscribe,
		hydrate: instructionsPageMocks.hydrate
	}
}));

import InstructionsWorkspace from '$lib/features/instructions/InstructionsWorkspace.svelte';

const discoveredInstruction: DiscoveredInstruction = {
	path: 'tentman/instructions/create-page',
	definition: {
		id: 'create-page',
		label: 'Create page',
		description: 'Scaffold a simple page.',
		inputs: [
			{
				id: 'title',
				type: 'text',
				label: 'Page title',
				required: true
			},
			{
				id: 'slug',
				type: 'slug',
				label: 'URL slug',
				required: true
			},
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
		}
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

const services: InstructionsWorkspaceServices = {
	async discoverInstructions(): Promise<InstructionDiscoveryResult> {
		return {
			instructions: [discoveredInstruction],
			issues: []
		};
	},
	planInstructionExecution,
	applyInstructionExecutionPlan
};

describe('InstructionsWorkspace', () => {
	beforeEach(() => {
		instructionsPageMocks.invalidateAll.mockClear();
		instructionsPageMocks.hydrate.mockClear();

		for (const key of Object.keys(instructionsPageMocks.files)) {
			if (
				key === 'tentman/configs/press-kit.tentman.json' ||
				key === 'tentman/navigation-manifest.json'
			) {
				delete instructionsPageMocks.files[key];
			}
		}

		instructionsPageMocks.files['tentman/navigation-manifest.json'] = JSON.stringify({
			version: 1,
			content: {
				items: ['about']
			}
		});
		instructionsPageMocks.files['src/routes/press-kit/+page.svelte'] = '<h1>Existing page</h1>\n';
	});

	it('previews and applies a local instruction with confirmation-first UX', async () => {
		const screen = render(InstructionsWorkspace, {
			data: {
				isAuthenticated: false,
				githubOAuthConfigured: true,
				user: null,
				recentRepos: [],
				selectedBackend: {
					kind: 'local',
					repo: {
						name: 'Docs',
						pathLabel: '~/Docs'
					}
				},
				selectedRepo: null,
				configs: [],
				blockConfigs: [],
				rootConfig: null,
				navigationManifest: {
					path: 'tentman/navigation-manifest.json',
					exists: false,
					manifest: null,
					error: null
				}
			},
			services,
			autoLoad: false,
			initialDiscoveryResult: {
				instructions: [discoveredInstruction],
				issues: []
			},
			initialBackendKey: 'local:docs'
		});

		await expect.element(screen.getByText('Create page')).toBeVisible();

		await screen.getByLabelText('Page title').fill('Press Kit');
		await screen.getByLabelText('URL slug').fill('Press Kit');
		await screen.getByRole('button', { name: 'Continue' }).click();

		await expect.element(screen.getByRole('heading', { name: 'Create Press Kit' })).toBeVisible();
		await expect.element(screen.getByText('Page title')).toBeVisible();
		await expect.element(screen.getByText('Press Kit', { exact: true })).toBeVisible();
		await expect.element(screen.getByText('URL slug')).toBeVisible();
		await expect.element(screen.getByText('press-kit', { exact: true })).toBeVisible();
		await expect
			.element(screen.getByText('This page will be added to Tentman navigation.'))
			.toBeVisible();

		await screen.getByRole('button', { name: 'Create page' }).click();

		await expect.element(screen.getByText('Created Press Kit')).toBeVisible();
		expect(instructionsPageMocks.files['tentman/configs/press-kit.tentman.json']).toContain(
			'"press-kit"'
		);
		expect(instructionsPageMocks.files['tentman/navigation-manifest.json']).toContain(
			'"press-kit"'
		);
		expect(instructionsPageMocks.files['src/routes/press-kit/+page.svelte']).toBe(
			'<h1>Existing page</h1>\n'
		);
	});
});
