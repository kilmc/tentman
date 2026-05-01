export const TENTMAN_GROUP_STORAGE_KEY = '_tentmanGroupId';

export function isTentmanGroupBlock(block) {
	return !!block && typeof block === 'object' && !Array.isArray(block) && block.type === 'tentmanGroup';
}
