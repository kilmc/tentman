import type { BlockUsage } from '$lib/config/types';

export function formatBlockIdLabel(id: string): string {
	return id
		.replace(/([A-Z])/g, ' $1')
		.replace(/_/g, ' ')
		.replace(/^./, (value) => value.toUpperCase())
		.trim();
}

export function getBlockLabel(block: Pick<BlockUsage, 'id' | 'label'>): string {
	return block.label ?? formatBlockIdLabel(block.id);
}

export function findBlockById(blocks: BlockUsage[], id: string): BlockUsage | undefined {
	return blocks.find((block) => block.id === id);
}
