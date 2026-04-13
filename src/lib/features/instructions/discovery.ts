import matter from 'gray-matter';
import {
	type DiscoveredInstruction,
	type InstructionConditionalLine,
	type InstructionConfirmation,
	type InstructionDefinition,
	type InstructionDiscoveryIssue,
	type InstructionDiscoveryResult,
	type InstructionInputDefinition,
	type InstructionInputOption,
	type InstructionInputType,
	type InstructionNavigationConfig,
	type InstructionNote,
	type InstructionTemplateFile
} from '$lib/features/instructions/types';
import type { RepositoryBackend } from '$lib/repository/types';

export const INSTRUCTIONS_ROOT = 'tentman/instructions';

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, context: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${context} must be a non-empty string`);
	}

	return value;
}

function readOptionalString(value: unknown, context: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	return readString(value, context);
}

function readBoolean(value: unknown, context: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`${context} must be a boolean`);
	}

	return value;
}

function readInputType(value: unknown, context: string): InstructionInputType {
	const type = readString(value, context);

	if (type === 'text' || type === 'slug' || type === 'boolean' || type === 'select') {
		return type;
	}

	throw new Error(`${context} must be one of text, slug, boolean, or select`);
}

function readInputOptions(value: unknown, context: string): InstructionInputOption[] | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`${context} must be a non-empty array`);
	}

	return value.map((option, index) => {
		if (!isRecord(option)) {
			throw new Error(`${context}[${index}] must be an object`);
		}

		return {
			value: readString(option.value, `${context}[${index}].value`),
			label: readString(option.label, `${context}[${index}].label`)
		};
	});
}

function parseInputDefinition(value: unknown, index: number): InstructionInputDefinition {
	if (!isRecord(value)) {
		throw new Error(`inputs[${index}] must be an object`);
	}

	const type = readInputType(value.type, `inputs[${index}].type`);
	const options = readInputOptions(value.options, `inputs[${index}].options`);
	const defaultValue = value.defaultValue;

	if (defaultValue !== undefined) {
		if (type === 'boolean' && typeof defaultValue !== 'boolean') {
			throw new Error(`inputs[${index}].defaultValue must be a boolean for boolean inputs`);
		}

		if (type !== 'boolean' && typeof defaultValue !== 'string') {
			throw new Error(`inputs[${index}].defaultValue must be a string for ${type} inputs`);
		}
	}

	if (type === 'select' && !options) {
		throw new Error(`inputs[${index}].options is required for select inputs`);
	}

	return {
		id: readString(value.id, `inputs[${index}].id`),
		type,
		label: readString(value.label, `inputs[${index}].label`),
		description: readOptionalString(value.description, `inputs[${index}].description`),
		required:
			value.required === undefined
				? false
				: readBoolean(value.required, `inputs[${index}].required`),
		defaultValue: defaultValue as string | boolean | undefined,
		options
	};
}

function parseConditionalLine(
	value: unknown,
	index: number,
	context: string
): InstructionConditionalLine {
	if (typeof value === 'string') {
		return { text: readString(value, `${context}[${index}]`) };
	}

	if (!isRecord(value)) {
		throw new Error(`${context}[${index}] must be a string or object`);
	}

	return {
		text: readString(value.text, `${context}[${index}].text`),
		if: readOptionalString(value.if, `${context}[${index}].if`)
	};
}

function parseConfirmation(value: unknown): InstructionConfirmation {
	if (!isRecord(value)) {
		throw new Error('confirmation must be an object');
	}

	const summary = value.summary;
	if (!Array.isArray(summary) || summary.length === 0) {
		throw new Error('confirmation.summary must be a non-empty array');
	}

	return {
		title: readOptionalString(value.title, 'confirmation.title'),
		summary: summary.map((line, index) => parseConditionalLine(line, index, 'confirmation.summary'))
	};
}

function parseNotes(value: unknown): InstructionNote[] {
	if (!Array.isArray(value)) {
		throw new Error('notes must be an array');
	}

	return value.map((note, index) => parseConditionalLine(note, index, 'notes'));
}

function parseNavigationConfig(value: unknown): InstructionNavigationConfig {
	if (!isRecord(value)) {
		throw new Error('navigation must be an object');
	}

	const enabled = value.enabled;
	if (enabled !== undefined && typeof enabled !== 'string' && typeof enabled !== 'boolean') {
		throw new Error('navigation.enabled must be a string template or boolean');
	}

	return {
		enabled: enabled as string | boolean | undefined,
		addItem: readString(value.addItem, 'navigation.addItem')
	};
}

export function parseInstructionDefinition(
	source: string,
	path = 'instruction.json'
): InstructionDefinition {
	const parsed = JSON.parse(source) as unknown;
	if (!isRecord(parsed)) {
		throw new Error(`${path} must contain a JSON object`);
	}

	if (!Array.isArray(parsed.inputs)) {
		throw new Error(`${path} inputs must be an array`);
	}

	const definition: InstructionDefinition = {
		id: readString(parsed.id, `${path} id`),
		label: readString(parsed.label, `${path} label`),
		description: readString(parsed.description, `${path} description`),
		inputs: parsed.inputs.map((input, index) => parseInputDefinition(input, index))
	};

	if (parsed.confirmation !== undefined) {
		definition.confirmation = parseConfirmation(parsed.confirmation);
	}

	if (parsed.notes !== undefined) {
		definition.notes = parseNotes(parsed.notes);
	}

	if (parsed.navigation !== undefined) {
		definition.navigation = parseNavigationConfig(parsed.navigation);
	}

	return definition;
}

export function parseInstructionTemplate(source: string, path: string): InstructionTemplateFile {
	const parsed = matter(source);
	const data = parsed.data;

	if (!isRecord(data)) {
		throw new Error(`${path} frontmatter must be an object`);
	}

	if (typeof data.to !== 'string' || data.to.trim().length === 0) {
		throw new Error(`${path} frontmatter.to must be a non-empty string`);
	}

	if (data.if !== undefined && typeof data.if !== 'string') {
		throw new Error(`${path} frontmatter.if must be a string when provided`);
	}

	if (data.skip_if_exists !== undefined && typeof data.skip_if_exists !== 'boolean') {
		throw new Error(`${path} frontmatter.skip_if_exists must be a boolean when provided`);
	}

	return {
		sourcePath: path,
		destinationPathTemplate: data.to,
		condition: data.if,
		skipIfExists: data.skip_if_exists ?? false,
		body: parsed.content
	};
}

async function listFilesRecursively(backend: RepositoryBackend, path: string): Promise<string[]> {
	const entries = await backend.listDirectory(path);
	const files: string[] = [];

	for (const entry of entries) {
		if (entry.kind === 'directory') {
			files.push(...(await listFilesRecursively(backend, entry.path)));
			continue;
		}

		files.push(entry.path);
	}

	return files;
}

function compareInstructions(a: DiscoveredInstruction, b: DiscoveredInstruction) {
	return (
		a.definition.label.localeCompare(b.definition.label) ||
		a.definition.id.localeCompare(b.definition.id)
	);
}

function compareIssues(a: InstructionDiscoveryIssue, b: InstructionDiscoveryIssue) {
	return a.path.localeCompare(b.path);
}

export async function discoverInstructions(
	backend: RepositoryBackend
): Promise<InstructionDiscoveryResult> {
	if (!(await backend.fileExists(INSTRUCTIONS_ROOT))) {
		return {
			instructions: [],
			issues: []
		};
	}

	const rootEntries = await backend.listDirectory(INSTRUCTIONS_ROOT);
	const instructions: DiscoveredInstruction[] = [];
	const issues: InstructionDiscoveryIssue[] = [];

	for (const entry of rootEntries) {
		if (entry.kind !== 'directory') {
			continue;
		}

		const instructionPath = entry.path;
		const definitionPath = `${instructionPath}/instruction.json`;
		if (!(await backend.fileExists(definitionPath))) {
			continue;
		}

		try {
			const definition = parseInstructionDefinition(
				await backend.readTextFile(definitionPath),
				definitionPath
			);
			const templatesRoot = `${instructionPath}/templates`;
			const templatePaths = (await backend.fileExists(templatesRoot))
				? (await listFilesRecursively(backend, templatesRoot)).filter((path) =>
						path.endsWith('.tmpl')
					)
				: [];
			const templates = await Promise.all(
				templatePaths
					.sort((left, right) => left.localeCompare(right))
					.map(async (templatePath) =>
						parseInstructionTemplate(await backend.readTextFile(templatePath), templatePath)
					)
			);

			instructions.push({
				path: instructionPath,
				definition,
				templates
			});
		} catch (error) {
			issues.push({
				path: definitionPath,
				message: error instanceof Error ? error.message : 'Failed to parse instruction'
			});
		}
	}

	return {
		instructions: instructions.sort(compareInstructions),
		issues: issues.sort(compareIssues)
	};
}
