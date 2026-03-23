import type { BlockAdapter } from '$lib/blocks/adapters/types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function validateBlockAdapterValue(
	value: unknown,
	expectedType: string,
	contextLabel: string
): BlockAdapter {
	if (!isRecord(value)) {
		throw new Error(`${contextLabel} must be an object`);
	}

	if (typeof value.type !== 'string' || value.type.length === 0) {
		throw new Error(`${contextLabel} must define a string "type"`);
	}

	if (value.type !== expectedType) {
		throw new Error(`${contextLabel} must use type "${expectedType}", received "${value.type}"`);
	}

	if (typeof value.getDefaultValue !== 'function') {
		throw new Error(`${contextLabel} must define "getDefaultValue"`);
	}

	if ('validate' in value && value.validate !== undefined && typeof value.validate !== 'function') {
		throw new Error(`${contextLabel} has an invalid "validate" export`);
	}

	return value as unknown as BlockAdapter;
}
