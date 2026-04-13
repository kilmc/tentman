import type {
	DiscoveredInstruction,
	InstructionInputDefinition,
	InstructionInputValues
} from '$lib/features/instructions/types';

export function normalizeSlug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

export function getDefaultValue(input: InstructionInputDefinition): string | boolean {
	if (input.defaultValue !== undefined) {
		return input.defaultValue;
	}

	return input.type === 'boolean' ? false : '';
}

export function createInstructionInputDefaults(
	instruction: DiscoveredInstruction
): InstructionInputValues {
	return Object.fromEntries(
		instruction.definition.inputs.map((input) => [input.id, getDefaultValue(input)])
	);
}
