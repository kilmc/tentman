import type { BlockUsage, PrimitiveBlockType, SelectBlockOptions } from '$lib/config/types';

export type FieldType = PrimitiveBlockType | 'array';

export interface FieldOptions {
	type: FieldType;
	label?: string;
	required?: boolean;
	generated?: boolean;
	show?: 'primary' | 'secondary';
	fields?: Record<string, FieldDefinition>;
	minLength?: number;
	maxLength?: number;
	options?: SelectBlockOptions;
}

export type FieldDefinition = FieldType | FieldOptions;

export interface FieldArrayItem {
	property: string;
	label: string;
	type: FieldType;
	required?: boolean;
	generated?: boolean;
	show?: 'primary' | 'secondary';
	fields?: FieldArrayItem[];
	minLength?: number;
	maxLength?: number;
}

function isFieldArrayItem(value: BlockUsage | FieldArrayItem): value is FieldArrayItem {
	return 'property' in value;
}

function toFieldDefinition(block: BlockUsage): FieldDefinition {
	if (block.type === 'block' && block.blocks) {
		return {
			type: 'array',
			...(block.label && { label: block.label }),
			...(block.required !== undefined && { required: block.required }),
			...(block.generated !== undefined && { generated: block.generated }),
			...(block.show && { show: block.show }),
			fields: buildFields(block.blocks),
			...(block.minLength !== undefined && { minLength: block.minLength }),
			...(block.maxLength !== undefined && { maxLength: block.maxLength })
		};
	}

	if (block.collection) {
		return {
			type: 'array',
			...(block.label && { label: block.label }),
			...(block.required !== undefined && { required: block.required }),
			...(block.generated !== undefined && { generated: block.generated }),
			...(block.show && { show: block.show }),
			...(block.minLength !== undefined && { minLength: block.minLength }),
			...(block.maxLength !== undefined && { maxLength: block.maxLength })
		};
	}

	return {
		type: block.type as FieldType,
		...(block.label && { label: block.label }),
		...(block.required !== undefined && { required: block.required }),
		...(block.generated !== undefined && { generated: block.generated }),
		...(block.show && { show: block.show }),
		...(block.minLength !== undefined && { minLength: block.minLength }),
		...(block.maxLength !== undefined && { maxLength: block.maxLength }),
		...(block.options && { options: block.options })
	};
}

export function buildFields(blocks: BlockUsage[]): Record<string, FieldDefinition> {
	return Object.fromEntries(blocks.map((block) => [block.id, toFieldDefinition(block)]));
}

export function normalizeFields(
	fields: Record<string, FieldDefinition> | FieldArrayItem[] | BlockUsage[]
): Record<string, FieldDefinition> {
	if (Array.isArray(fields)) {
		if (fields.length === 0) {
			return {};
		}

		if (isFieldArrayItem(fields[0])) {
			return Object.fromEntries(
				(fields as FieldArrayItem[]).map((field) => [
					field.property,
					field.fields
						? {
								type: field.type,
								label: field.label,
								...(field.required !== undefined && { required: field.required }),
								...(field.generated !== undefined && { generated: field.generated }),
								...(field.show && { show: field.show }),
								...(field.minLength !== undefined && { minLength: field.minLength }),
								...(field.maxLength !== undefined && { maxLength: field.maxLength }),
								fields: normalizeFields(field.fields)
							}
						: {
								type: field.type,
								label: field.label,
								...(field.required !== undefined && { required: field.required }),
								...(field.generated !== undefined && { generated: field.generated }),
								...(field.show && { show: field.show }),
								...(field.minLength !== undefined && { minLength: field.minLength }),
								...(field.maxLength !== undefined && { maxLength: field.maxLength })
							}
				])
			);
		}

		return buildFields(fields as BlockUsage[]);
	}

	return fields;
}
