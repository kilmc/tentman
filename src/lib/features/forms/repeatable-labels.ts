import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';

function formatDisplayableValue(value: unknown): string | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}

	if (typeof value === 'string') {
		const label = String(value).trim();
		return label.length > 0 ? label : null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return null;
}

export function getRepeatableItemLabel(
	item: unknown,
	index: number,
	blocks: BlockUsage[],
	itemLabel?: string
): string {
	const fallback = `Item ${index + 1}`;
	const prefix = itemLabel?.trim();

	if (item && typeof item === 'object' && !Array.isArray(item)) {
		const record = item as ContentRecord;
		const textBlocks = blocks.filter((block) =>
			['text', 'textarea', 'markdown', 'email', 'url'].includes(block.type)
		);
		const imageBlocks = blocks.filter((block) => block.type === 'image');
		const labelBlocks = [...textBlocks, ...imageBlocks];

		for (const block of labelBlocks) {
			const valueLabel = formatDisplayableValue(record[block.id]);
			if (valueLabel) {
				return prefix ? `${prefix} ${index + 1}: ${valueLabel}` : valueLabel;
			}
		}
	}

	return prefix ? `${prefix} ${index + 1}` : fallback;
}
