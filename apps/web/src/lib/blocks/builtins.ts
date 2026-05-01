import type { PrimitiveBlockType } from '$lib/config/types';
import { BUILT_IN_BLOCK_ADAPTERS } from '$lib/blocks/adapters/builtins';
import type { BlockAdapter } from '$lib/blocks/adapters/types';

export interface BuiltInBlockDefinition {
	id: PrimitiveBlockType;
	kind: 'built_in';
	label: string;
	adapter: BlockAdapter;
}

export const BUILT_IN_BLOCKS: BuiltInBlockDefinition[] = [
	{ id: 'text', kind: 'built_in', label: 'Text', adapter: BUILT_IN_BLOCK_ADAPTERS.text },
	{
		id: 'textarea',
		kind: 'built_in',
		label: 'Textarea',
		adapter: BUILT_IN_BLOCK_ADAPTERS.textarea
	},
	{
		id: 'markdown',
		kind: 'built_in',
		label: 'Markdown',
		adapter: BUILT_IN_BLOCK_ADAPTERS.markdown
	},
	{ id: 'email', kind: 'built_in', label: 'Email', adapter: BUILT_IN_BLOCK_ADAPTERS.email },
	{ id: 'url', kind: 'built_in', label: 'URL', adapter: BUILT_IN_BLOCK_ADAPTERS.url },
	{ id: 'number', kind: 'built_in', label: 'Number', adapter: BUILT_IN_BLOCK_ADAPTERS.number },
	{ id: 'date', kind: 'built_in', label: 'Date', adapter: BUILT_IN_BLOCK_ADAPTERS.date },
	{
		id: 'boolean',
		kind: 'built_in',
		label: 'Boolean',
		adapter: BUILT_IN_BLOCK_ADAPTERS.boolean
	},
	{ id: 'toggle', kind: 'built_in', label: 'Toggle', adapter: BUILT_IN_BLOCK_ADAPTERS.toggle },
	{ id: 'image', kind: 'built_in', label: 'Image', adapter: BUILT_IN_BLOCK_ADAPTERS.image },
	{ id: 'select', kind: 'built_in', label: 'Select', adapter: BUILT_IN_BLOCK_ADAPTERS.select }
];
