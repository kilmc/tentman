import type { BlockUsage, TentmanGroupBlockUsage } from '$lib/config/types';

export const TENTMAN_GROUP_BLOCK_ID = 'tentmanGroup';
export const TENTMAN_GROUP_STORAGE_KEY = '_tentmanGroupId';

export function isTentmanGroupBlock(block: BlockUsage): block is TentmanGroupBlockUsage {
	return block.type === 'tentmanGroup';
}

export function getBlockStorageKey(block: BlockUsage): string {
	return isTentmanGroupBlock(block) ? TENTMAN_GROUP_STORAGE_KEY : block.id;
}
