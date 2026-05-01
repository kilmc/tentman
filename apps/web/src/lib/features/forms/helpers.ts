import type { ParsedContentConfig } from '$lib/config/parse';
import { normalizeFields } from '$lib/config/fields-compat';
import type { BlockUsage } from '$lib/config/types';
import { getBlockStorageKey } from '$lib/config/tentman-group';
import { toBlockAdapterUsageFromBlock } from '$lib/blocks/compat';
import type { BlockRegistry } from '$lib/blocks/registry';
import { DEFAULT_BLOCK_REGISTRY, resolveBlockAdapterForUsage } from '$lib/blocks/registry';
import type { CardFields } from '$lib/features/content-management/item';
import type { ContentRecord } from '$lib/features/content-management/types';

export function buildBlockFormData(
	blocks: BlockUsage[],
	initialData: ContentRecord = {},
	registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY
): ContentRecord {
	const formData: ContentRecord = {};

	for (const block of blocks) {
		const adapter = resolveBlockAdapterForUsage(block, registry);
		const storageKey = getBlockStorageKey(block);
		formData[storageKey] =
			initialData[storageKey] !== undefined
				? initialData[storageKey]
				: adapter
					? adapter.getDefaultValue(toBlockAdapterUsageFromBlock(block))
					: '';
	}

	return formData;
}

export function buildFormData(
	config: ParsedContentConfig,
	initialData: ContentRecord = {},
	registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY
): ContentRecord {
	return buildBlockFormData(config.blocks, initialData, registry);
}

export function getCardFields(config: ParsedContentConfig): CardFields {
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

export { normalizeFields };
