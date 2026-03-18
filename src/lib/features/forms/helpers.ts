import { getFieldLabel, normalizeFields, type Config, type FieldDefinition } from '$lib/types/config';
import type { CardFields } from '$lib/features/content-management/item';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

export function getDefaultFieldValue(fieldDef: FieldDefinition): ContentValue {
	const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;

	switch (fieldType) {
		case 'boolean':
			return false;
		case 'number':
			return 0;
		case 'array':
			return [];
		default:
			return '';
	}
}

export function buildFormData(config: Config, initialData: ContentRecord = {}): ContentRecord {
	const normalizedFields = normalizeFields(config.fields);
	const formData: ContentRecord = {};

	for (const [fieldName, fieldDef] of Object.entries(normalizedFields)) {
		formData[fieldName] =
			initialData[fieldName] !== undefined ? initialData[fieldName] : getDefaultFieldValue(fieldDef);
	}

	return formData;
}

export function getCardFields(config: Config): CardFields {
	const entries = Object.entries(normalizeFields(config.fields));
	const hasShowConfig = entries.some(
		([, fieldDef]) => typeof fieldDef === 'object' && fieldDef.show !== undefined
	);

	if (hasShowConfig) {
		return {
			primary: entries.filter(
				([, fieldDef]) => typeof fieldDef === 'object' && fieldDef.show === 'primary'
			),
			secondary: entries.filter(
				([, fieldDef]) => typeof fieldDef === 'object' && fieldDef.show === 'secondary'
			)
		};
	}

	return {
		primary: entries.length > 0 ? [entries[0]] : [],
		secondary: []
	};
}

export { getFieldLabel, normalizeFields };
