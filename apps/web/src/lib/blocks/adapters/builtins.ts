import type { ContentValue } from '$lib/features/content-management/types';
import type { PrimitiveBlockType } from '$lib/config/types';
import type { BlockAdapter, BlockAdapterUsage } from '$lib/blocks/adapters/types';

function getBlockLabel(usage: BlockAdapterUsage): string {
	return usage.label ?? usage.id;
}

function validateRequired(value: ContentValue | undefined, usage: BlockAdapterUsage): string[] {
	if (usage.required && (value === undefined || value === null || value === '')) {
		return [`${getBlockLabel(usage)} is required`];
	}

	return [];
}

function validateStringLength(value: string, usage: BlockAdapterUsage): string[] {
	const errors: string[] = [];

	if (usage.minLength !== undefined && value.length < usage.minLength) {
		errors.push(
			`${getBlockLabel(usage)} must be at least ${usage.minLength} character${usage.minLength === 1 ? '' : 's'}`
		);
	}

	if (usage.maxLength !== undefined && value.length > usage.maxLength) {
		errors.push(
			`${getBlockLabel(usage)} must not exceed ${usage.maxLength} character${usage.maxLength === 1 ? '' : 's'}`
		);
	}

	return errors;
}

function createStringAdapter(type: PrimitiveBlockType): BlockAdapter {
	return {
		type,
		getDefaultValue() {
			return '';
		},
		validate(value, usage) {
			const requiredErrors = validateRequired(value, usage);
			if (requiredErrors.length > 0) {
				return requiredErrors;
			}

			if (value === undefined || value === null || value === '') {
				return [];
			}

			if (typeof value !== 'string') {
				return [`${getBlockLabel(usage)} must be a string`];
			}

			return validateStringLength(value, usage);
		}
	};
}

const textAdapter = createStringAdapter('text');
const textareaAdapter = createStringAdapter('textarea');
const markdownAdapter = createStringAdapter('markdown');

const emailAdapter: BlockAdapter = {
	type: 'email',
	getDefaultValue() {
		return '';
	},
	validate(value, usage) {
		const requiredErrors = validateRequired(value, usage);
		if (requiredErrors.length > 0) {
			return requiredErrors;
		}

		if (value === undefined || value === null || value === '') {
			return [];
		}

		if (typeof value !== 'string') {
			return [`${getBlockLabel(usage)} must be a valid email address`];
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(value) ? [] : [`${getBlockLabel(usage)} must be a valid email address`];
	}
};

const urlAdapter: BlockAdapter = {
	type: 'url',
	getDefaultValue() {
		return '';
	},
	validate(value, usage) {
		const requiredErrors = validateRequired(value, usage);
		if (requiredErrors.length > 0) {
			return requiredErrors;
		}

		if (value === undefined || value === null || value === '') {
			return [];
		}

		if (typeof value !== 'string') {
			return [`${getBlockLabel(usage)} must be a valid URL`];
		}

		try {
			new URL(value);
			return [];
		} catch {
			return [`${getBlockLabel(usage)} must be a valid URL`];
		}
	}
};

const numberAdapter: BlockAdapter = {
	type: 'number',
	getDefaultValue() {
		return 0;
	},
	validate(value, usage) {
		const requiredErrors = validateRequired(value, usage);
		if (requiredErrors.length > 0) {
			return requiredErrors;
		}

		if (value === undefined || value === null || value === '') {
			return [];
		}

		return typeof value === 'number' && !Number.isNaN(value)
			? []
			: [`${getBlockLabel(usage)} must be a valid number`];
	}
};

const dateAdapter: BlockAdapter = {
	type: 'date',
	getDefaultValue() {
		return '';
	},
	validate(value, usage) {
		const requiredErrors = validateRequired(value, usage);
		if (requiredErrors.length > 0) {
			return requiredErrors;
		}

		if (value === undefined || value === null || value === '') {
			return [];
		}

		if (typeof value !== 'string') {
			return [`${getBlockLabel(usage)} must be a valid date`];
		}

		const parsedDate = new Date(value);
		return Number.isNaN(parsedDate.getTime())
			? [`${getBlockLabel(usage)} must be a valid date`]
			: [];
	}
};

function createBooleanAdapter(type: 'boolean' | 'toggle'): BlockAdapter {
	return {
		type,
		getDefaultValue() {
			return false;
		},
		validate(value, usage) {
			const requiredErrors = validateRequired(value, usage);
			if (requiredErrors.length > 0) {
				return requiredErrors;
			}

			if (value === undefined || value === null || value === '') {
				return [];
			}

			return typeof value === 'boolean' ? [] : [`${getBlockLabel(usage)} must be true or false`];
		}
	};
}

const booleanAdapter = createBooleanAdapter('boolean');
const toggleAdapter = createBooleanAdapter('toggle');

const imageAdapter: BlockAdapter = {
	type: 'image',
	getDefaultValue() {
		return '';
	},
	validate(value, usage) {
		const requiredErrors = validateRequired(value, usage);
		if (requiredErrors.length > 0) {
			return requiredErrors;
		}

		if (value === undefined || value === null || value === '') {
			return [];
		}

		return typeof value === 'string' ? [] : [`${getBlockLabel(usage)} must be an image path`];
	}
};

const selectAdapter: BlockAdapter = {
	type: 'select',
	getDefaultValue() {
		return '';
	},
	validate(value, usage) {
		const requiredErrors = validateRequired(value, usage);
		if (requiredErrors.length > 0) {
			return requiredErrors;
		}

		if (value === undefined || value === null || value === '') {
			return [];
		}

		if (typeof value !== 'string') {
			return [`${getBlockLabel(usage)} must be one of the configured options`];
		}

		if (usage.type === 'tentmanGroup') {
			return [];
		}

		const options = usage.options ?? [];
		return options.some((option) => option.value === value)
			? []
			: [`${getBlockLabel(usage)} must be one of the configured options`];
	}
};

export const BUILT_IN_BLOCK_ADAPTERS: Record<PrimitiveBlockType, BlockAdapter> = {
	text: textAdapter,
	textarea: textareaAdapter,
	markdown: markdownAdapter,
	email: emailAdapter,
	url: urlAdapter,
	number: numberAdapter,
	date: dateAdapter,
	boolean: booleanAdapter,
	toggle: toggleAdapter,
	image: imageAdapter,
	select: selectAdapter
};
