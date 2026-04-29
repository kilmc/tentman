import type { BlockUsage } from '$lib/config/types';
import type { BlockAdapterUsage } from '$lib/blocks/adapters/types';

export function toBlockAdapterUsageFromBlock(block: BlockUsage): BlockAdapterUsage {
	return {
		id: block.id,
		type: block.type,
		...(block.label && { label: block.label }),
		...(block.required !== undefined && { required: block.required }),
		...(block.collection !== undefined && { collection: block.collection }),
		...(block.minLength !== undefined && { minLength: block.minLength }),
		...(block.maxLength !== undefined && { maxLength: block.maxLength }),
		...(block.type === 'select' && block.options ? { options: block.options } : {})
	};
}
