import type { BlockUsage } from '$lib/config/types';
import { toBlockAdapterUsageFromBlock } from '$lib/blocks/compat';
import type { BlockAdapter, BlockAdapterUsage } from '$lib/blocks/adapters/types';
import type { ContentRecord } from '$lib/features/content-management/types';

interface StructuredBlockAdapterOptions {
	type: string;
	blocks: BlockUsage[];
	defaultCollection?: boolean;
	resolveAdapter: (usage: BlockUsage) => BlockAdapter | undefined;
}

function getBlockLabel(usage: BlockAdapterUsage): string {
	return usage.label ?? usage.id;
}

function isCollectionUsage(
	usage: BlockAdapterUsage,
	defaultCollection: boolean | undefined
): boolean {
	return usage.collection ?? defaultCollection ?? false;
}

function getStructuredDefaults(
	blocks: BlockUsage[],
	resolveAdapter: (usage: BlockUsage) => BlockAdapter | undefined
): ContentRecord {
	const result: ContentRecord = {};

	for (const block of blocks) {
		const adapter = resolveAdapter(block);
		if (!adapter) {
			continue;
		}

		result[block.id] = adapter.getDefaultValue(toBlockAdapterUsageFromBlock(block));
	}

	return result;
}

function validateStructuredObject(
	value: ContentRecord,
	blocks: BlockUsage[],
	resolveAdapter: (usage: BlockUsage) => BlockAdapter | undefined
): string[] {
	const errors: string[] = [];

	for (const block of blocks) {
		const adapter = resolveAdapter(block);
		if (!adapter?.validate) {
			continue;
		}

		errors.push(...adapter.validate(value[block.id], toBlockAdapterUsageFromBlock(block)));
	}

	return errors;
}

export function createStructuredBlockAdapter({
	type,
	blocks,
	defaultCollection,
	resolveAdapter
}: StructuredBlockAdapterOptions): BlockAdapter {
	return {
		type,
		getDefaultValue(usage) {
			return isCollectionUsage(usage, defaultCollection)
				? []
				: getStructuredDefaults(blocks, resolveAdapter);
		},
		validate(value, usage) {
			const label = getBlockLabel(usage);
			const collection = isCollectionUsage(usage, defaultCollection);

			if (collection) {
				if (usage.required && (!Array.isArray(value) || value.length === 0)) {
					return [`${label} is required`];
				}

				if (value === undefined || value === null) {
					return [];
				}

				if (!Array.isArray(value)) {
					return [`${label} must be an array`];
				}

				const errors: string[] = [];

				for (const [index, item] of value.entries()) {
					if (!item || typeof item !== 'object' || Array.isArray(item)) {
						errors.push(`${label} item ${index + 1} must be an object`);
						continue;
					}

					const itemErrors = validateStructuredObject(
						item as ContentRecord,
						blocks,
						resolveAdapter
					);
					errors.push(...itemErrors.map((message) => `${label} item ${index + 1}: ${message}`));
				}

				return errors;
			}

			if (usage.required && (value === undefined || value === null)) {
				return [`${label} is required`];
			}

			if (value === undefined || value === null) {
				return [];
			}

			if (typeof value !== 'object' || Array.isArray(value)) {
				return [`${label} must be an object`];
			}

			return validateStructuredObject(value as ContentRecord, blocks, resolveAdapter);
		}
	};
}
