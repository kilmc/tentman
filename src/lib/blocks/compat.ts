import type { BlockUsage } from '$lib/config/types';
import type { BlockAdapterUsage } from '$lib/blocks/adapters/types';
import type { FieldDefinition } from '$lib/types/config';

export function toBlockAdapterUsage(id: string, fieldDef: FieldDefinition): BlockAdapterUsage {
	if (typeof fieldDef === 'string') {
		return {
			id,
			type: fieldDef
		};
	}

	return {
		id,
		type: fieldDef.type,
		...(fieldDef.label && { label: fieldDef.label }),
		...(fieldDef.required !== undefined && { required: fieldDef.required }),
		...(fieldDef.minLength !== undefined && { minLength: fieldDef.minLength }),
		...(fieldDef.maxLength !== undefined && { maxLength: fieldDef.maxLength })
	};
}

export function toBlockAdapterUsageFromBlock(block: BlockUsage): BlockAdapterUsage {
	return {
		id: block.id,
		type: block.type,
		...(block.label && { label: block.label }),
		...(block.required !== undefined && { required: block.required }),
		...(block.collection !== undefined && { collection: block.collection }),
		...(block.minLength !== undefined && { minLength: block.minLength }),
		...(block.maxLength !== undefined && { maxLength: block.maxLength })
	};
}
