import type { BlockUsage } from '$lib/config/types';
import { getRepeatableItemLabel as getResolvedRepeatableItemLabel } from '$lib/features/content-management/item-labels';

export function getRepeatableItemLabel(
	item: unknown,
	index: number,
	blocks: BlockUsage[],
	itemLabel?: string
): string {
	return getResolvedRepeatableItemLabel(item, index, blocks, itemLabel);
}
