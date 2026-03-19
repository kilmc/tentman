import type { BlockRegistry } from '$lib/blocks/registry';
import { DEFAULT_BLOCK_REGISTRY, resolveBlockAdapterForUsage } from '$lib/blocks/registry';
import { toBlockAdapterUsage } from '$lib/blocks/compat';
import { getFieldLabel, normalizeFields, type Config, type FieldDefinition } from '$lib/types/config';
import type { CardFields } from '$lib/features/content-management/item';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

export function getDefaultFieldValue(fieldDef: FieldDefinition, fieldName = 'field'): ContentValue {
	const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;

	if (fieldType === 'array') {
		return [];
	}

	const adapter = DEFAULT_BLOCK_REGISTRY.getAdapter(fieldType);
	if (adapter) {
		return adapter.getDefaultValue(toBlockAdapterUsage(fieldName, fieldDef));
	}

	return '';
}

export function buildBlockFormData(
	blocks: Config['blocks'],
	initialData: ContentRecord = {},
	registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY
): ContentRecord {
	const formData: ContentRecord = {};

	for (const block of blocks) {
		const adapter = resolveBlockAdapterForUsage(block, registry);
		formData[block.id] =
			initialData[block.id] !== undefined
				? initialData[block.id]
				: adapter
					? adapter.getDefaultValue(block)
					: '';
	}

	return formData;
}

export function buildFormData(
	config: Config,
	initialData: ContentRecord = {},
	registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY
): ContentRecord {
	return buildBlockFormData(config.blocks, initialData, registry);
}

export function getCardFields(config: Config): CardFields {
	const hasShowConfig = config.blocks.some((block) => block.show !== undefined);

	if (hasShowConfig) {
		return {
			primary: config.blocks.filter((block) => block.show === 'primary'),
			secondary: config.blocks.filter((block) => block.show === 'secondary')
		};
	}

	return {
		primary: config.blocks.length > 0 ? [config.blocks[0]] : [],
		secondary: []
	};
}

export { getFieldLabel, normalizeFields };
