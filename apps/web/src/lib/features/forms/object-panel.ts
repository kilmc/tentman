import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';

function blockContainsNestedCollection(
	block: BlockUsage,
	blockRegistry: Pick<BlockRegistry, 'get'>
): boolean {
	const structuredBlocks = getStructuredBlocksForUsage(block, blockRegistry);
	if (!structuredBlocks) {
		return false;
	}

	if (structuredBlocks.collection) {
		return true;
	}

	return structuredBlocks.blocks.some((childBlock) =>
		blockContainsNestedCollection(childBlock, blockRegistry)
	);
}

export function containsNestedStructuredCollection(
	blocks: BlockUsage[],
	blockRegistry: Pick<BlockRegistry, 'get'>
): boolean {
	return blocks.some((block) => blockContainsNestedCollection(block, blockRegistry));
}
