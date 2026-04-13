import {
	NAVIGATION_MANIFEST_PATH,
	loadNavigationManifestState,
	type NavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import {
	createInstructionInputDefaults,
	getDefaultValue,
	normalizeSlug
} from '$lib/features/instructions/input';
import type { RepositoryBackend } from '$lib/repository/types';
import type {
	DiscoveredInstruction,
	InstructionConditionalLine,
	InstructionExecutionPlan,
	InstructionInputError,
	InstructionInputValues,
	PlannedFileCreate,
	PlannedNavigationChange
} from '$lib/features/instructions/types';

const EXACT_TEMPLATE_PATTERN = /^\s*\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\s*$/;
const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function normalizePath(path: string): string {
	return path.replace(/^\.?\//, '').replace(/\/{2,}/g, '/');
}

export { createInstructionInputDefaults, normalizeSlug } from '$lib/features/instructions/input';

function renderStringTemplate(template: string, values: InstructionInputValues): string {
	return template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
		const value = values[key];
		if (value === undefined || value === null) {
			return '';
		}

		return String(value);
	});
}

function resolveBooleanTemplate(
	template: string | boolean | undefined,
	values: InstructionInputValues
): boolean {
	if (template === undefined) {
		return true;
	}

	if (typeof template === 'boolean') {
		return template;
	}

	const exactMatch = template.match(EXACT_TEMPLATE_PATTERN);
	if (exactMatch) {
		const resolved = values[exactMatch[1]];
		return Boolean(resolved);
	}

	const rendered = renderStringTemplate(template, values).trim().toLowerCase();
	if (rendered.length === 0) {
		return false;
	}

	if (rendered === 'false' || rendered === '0' || rendered === 'no' || rendered === 'off') {
		return false;
	}

	return true;
}

function resolveConditionalLines(
	lines: InstructionConditionalLine[] | undefined,
	values: InstructionInputValues
): string[] {
	if (!lines) {
		return [];
	}

	return lines.flatMap((line) => {
		if (line.if && !resolveBooleanTemplate(line.if, values)) {
			return [];
		}

		return [renderStringTemplate(line.text, values)];
	});
}

export function validateInstructionInputs(
	instruction: DiscoveredInstruction,
	values: InstructionInputValues
): {
	normalizedValues: InstructionInputValues;
	inputErrors: InstructionInputError[];
} {
	const normalizedValues: InstructionInputValues = {};
	const inputErrors: InstructionInputError[] = [];

	for (const input of instruction.definition.inputs) {
		const rawValue = values[input.id] ?? getDefaultValue(input);

		if (input.type === 'boolean') {
			if (typeof rawValue !== 'boolean') {
				inputErrors.push({
					inputId: input.id,
					message: `${input.label} must be true or false.`
				});
				normalizedValues[input.id] = false;
				continue;
			}

			normalizedValues[input.id] = rawValue;
			if (input.required && !rawValue) {
				inputErrors.push({
					inputId: input.id,
					message: `${input.label} must be enabled.`
				});
			}
			continue;
		}

		const stringValue = String(rawValue ?? '');
		const normalizedString =
			input.type === 'slug' ? normalizeSlug(stringValue) : stringValue.trim();
		normalizedValues[input.id] = normalizedString;

		if (input.required && normalizedString.length === 0) {
			inputErrors.push({
				inputId: input.id,
				message: `${input.label} is required.`
			});
		}

		if (input.type === 'select' && input.options) {
			const validOption = input.options.some((option) => option.value === normalizedString);
			if (!validOption) {
				inputErrors.push({
					inputId: input.id,
					message: `${input.label} must use one of the provided options.`
				});
			}
		}
	}

	return {
		normalizedValues,
		inputErrors
	};
}

async function buildPlannedFiles(
	backend: RepositoryBackend,
	instruction: DiscoveredInstruction,
	values: InstructionInputValues
): Promise<PlannedFileCreate[]> {
	const plannedFiles: PlannedFileCreate[] = [];
	const seenPaths = new Set<string>();

	for (const template of instruction.templates) {
		if (template.condition && !resolveBooleanTemplate(template.condition, values)) {
			continue;
		}

		const path = normalizePath(renderStringTemplate(template.destinationPathTemplate, values));
		const isDuplicatePath = seenPaths.has(path);
		seenPaths.add(path);
		const content = renderStringTemplate(template.body, values);
		const exists = isDuplicatePath ? false : await backend.fileExists(path);
		const status = isDuplicatePath
			? 'conflict'
			: exists
				? template.skipIfExists
					? 'skip-existing'
					: 'conflict'
				: 'create';
		const reason =
			isDuplicatePath
				? 'Another template in this instruction already targets this path.'
				: status === 'skip-existing'
				? 'Skipped because the target file already exists.'
				: status === 'conflict'
					? 'A file already exists at this path.'
					: null;

		plannedFiles.push({
			path,
			content,
			sourceTemplatePath: template.sourcePath,
			status,
			reason
		});
	}

	return plannedFiles.sort((left, right) => left.path.localeCompare(right.path));
}

function buildNavigationManifestWithItem(
	manifest: NavigationManifest | null,
	configId: string
): { manifest: NavigationManifest; change: PlannedNavigationChange } {
	if (!manifest) {
		const nextManifest: NavigationManifest = {
			version: 1,
			content: {
				items: [configId]
			}
		};

		return {
			manifest: nextManifest,
			change: {
				path: NAVIGATION_MANIFEST_PATH,
				status: 'create-manifest',
				configId,
				summary: 'Tentman will create a navigation manifest and add this item.',
				nextManifest
			}
		};
	}

	const existingItems = manifest.content?.items ?? [];
	if (existingItems.includes(configId)) {
		return {
			manifest,
			change: {
				path: NAVIGATION_MANIFEST_PATH,
				status: 'noop-existing-item',
				configId,
				summary: 'This item is already present in Tentman navigation.'
			}
		};
	}

	const nextManifest: NavigationManifest = {
		...manifest,
		content: {
			items: [...existingItems, configId]
		}
	};

	return {
		manifest: nextManifest,
		change: {
			path: NAVIGATION_MANIFEST_PATH,
			status: 'append-item',
			configId,
			summary: 'Tentman will append this item to the existing navigation manifest.',
			nextManifest
		}
	};
}

async function buildNavigationChange(
	backend: RepositoryBackend,
	instruction: DiscoveredInstruction,
	values: InstructionInputValues
): Promise<PlannedNavigationChange | null> {
	const navigation = instruction.definition.navigation;
	if (!navigation || !resolveBooleanTemplate(navigation.enabled, values)) {
		return null;
	}

	const configId = renderStringTemplate(navigation.addItem, values).trim();
	if (configId.length === 0) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			status: 'error',
			configId: '',
			summary: 'Navigation is enabled, but no config id was resolved.'
		};
	}

	const manifestState = await loadNavigationManifestState(backend);
	if (manifestState.error) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			status: 'error',
			configId,
			summary: `Tentman could not parse the existing navigation manifest: ${manifestState.error}`
		};
	}

	return buildNavigationManifestWithItem(manifestState.manifest, configId).change;
}

function buildPlanErrors(
	files: PlannedFileCreate[],
	navigationChange: PlannedNavigationChange | null
) {
	const errors = files
		.filter((file) => file.status === 'conflict')
		.map((file) =>
			file.reason === 'Another template in this instruction already targets this path.'
				? `${file.path} is targeted by more than one template in this instruction.`
				: `${file.path} already exists.`
		);

	if (navigationChange?.status === 'error') {
		errors.push(navigationChange.summary);
	}

	return errors;
}

function buildFallbackConfirmationSummary(
	files: PlannedFileCreate[],
	navigationChange: PlannedNavigationChange | null
): string[] {
	const lines = files
		.filter((file) => file.status === 'create')
		.map((file) => `This will create ${file.path}.`);

	if (files.some((file) => file.status === 'skip-existing')) {
		lines.push('Existing files marked to skip will be left untouched.');
	}

	if (files.some((file) => file.status === 'conflict')) {
		lines.push('Some target files already exist and need your review before Tentman can apply.');
	}

	if (navigationChange && navigationChange.status !== 'error') {
		lines.push(navigationChange.summary);
	}

	if (lines.length === 0) {
		lines.push('Tentman did not find any file templates or navigation changes for this instruction.');
	}

	return lines;
}

export async function planInstructionExecution(
	backend: RepositoryBackend,
	instruction: DiscoveredInstruction,
	values: InstructionInputValues
): Promise<InstructionExecutionPlan> {
	const { normalizedValues, inputErrors } = validateInstructionInputs(instruction, values);
	const files =
		inputErrors.length === 0 ? await buildPlannedFiles(backend, instruction, normalizedValues) : [];
	const navigationChange =
		inputErrors.length === 0
			? await buildNavigationChange(backend, instruction, normalizedValues)
			: null;
	const fallbackSummary = buildFallbackConfirmationSummary(files, navigationChange);
	const confirmationSummary =
		resolveConditionalLines(instruction.definition.confirmation?.summary, normalizedValues).length >
		0
			? resolveConditionalLines(instruction.definition.confirmation?.summary, normalizedValues)
			: fallbackSummary;

	return {
		instructionId: instruction.definition.id,
		instructionLabel: instruction.definition.label,
		inputValues: normalizedValues,
		confirmationTitle: instruction.definition.confirmation?.title
			? renderStringTemplate(instruction.definition.confirmation.title, normalizedValues)
			: `Create ${instruction.definition.label}`,
		confirmationSummary,
		notes: resolveConditionalLines(instruction.definition.notes, normalizedValues),
		files,
		navigationChange,
		inputErrors,
		planErrors: inputErrors.length > 0 ? [] : buildPlanErrors(files, navigationChange)
	};
}
