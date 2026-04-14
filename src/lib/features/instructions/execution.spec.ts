import { describe, expect, it } from 'vitest';
import { applyInstructionExecutionPlan } from '$lib/features/instructions/execution';
import type { InstructionExecutionPlan } from '$lib/features/instructions/types';
import type {
	RepoEntry,
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

function createBackend(
	files: Record<string, string>
): RepositoryBackend & { files: Record<string, string> } {
	return {
		kind: 'local',
		cacheKey: 'local:test',
		label: 'Local test',
		supportsDraftBranches: false,
		files,
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
		async writeTextFile(path: string, content: string, _options?: RepositoryWriteOptions) {
			files[path] = content;
		},
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

const basePlan: InstructionExecutionPlan = {
	instructionId: 'create-page',
	instructionLabel: 'Create page',
	inputValues: {
		title: 'Press Kit',
		slug: 'press-kit',
		showInNavigation: true
	},
	inputSummary: [
		{
			label: 'Page title',
			value: 'Press Kit'
		},
		{
			label: 'URL slug',
			value: 'press-kit'
		},
		{
			label: 'Show in navigation',
			value: 'Yes'
		}
	],
	confirmationTitle: 'Create Press Kit',
	confirmationSummary: ['This will create a new page at /press-kit.'],
	notes: [],
	files: [
		{
			path: 'tentman/configs/press-kit.tentman.json',
			content: '{"id":"press-kit"}\n',
			sourceTemplatePath: 'templates/config.tmpl',
			status: 'create',
			reason: null
		},
		{
			path: 'src/routes/press-kit/+page.svelte',
			content: '<h1>Press Kit</h1>\n',
			sourceTemplatePath: 'templates/page.tmpl',
			status: 'skip-existing',
			reason: 'Skipped because the target file already exists.'
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
};

describe('instruction execution', () => {
	it('writes create operations, preserves skipped files, and updates navigation', async () => {
		const backend = createBackend({
			'src/routes/press-kit/+page.svelte': '<h1>Existing page</h1>\n'
		});

		const result = await applyInstructionExecutionPlan(backend, basePlan);

		expect(result).toEqual({
			createdFiles: ['tentman/configs/press-kit.tentman.json'],
			skippedFiles: ['src/routes/press-kit/+page.svelte'],
			navigationUpdated: true,
			navigationStatus: 'append-item'
		});
		expect(backend.files['tentman/configs/press-kit.tentman.json']).toBe('{"id":"press-kit"}\n');
		expect(backend.files['tentman/navigation-manifest.json']).toContain('"press-kit"');
		expect(backend.files['src/routes/press-kit/+page.svelte']).toBe('<h1>Existing page</h1>\n');
	});

	it('refuses to apply plans with remaining errors', async () => {
		await expect(
			applyInstructionExecutionPlan(createBackend({}), {
				...basePlan,
				planErrors: ['tentman/configs/press-kit.tentman.json already exists.']
			})
		).rejects.toThrow('Resolve the remaining plan issues before applying this instruction.');
	});
});
