import type { EditorLayoutConfig, BlockUsage } from '$lib/config/types';

export const DEFAULT_EDITOR_ASIDE_LABEL = 'Details';
export const EDITOR_ASIDE_WIDE_THRESHOLD_PX = 896;

export interface StructuredEditorSections {
	primaryBlocks: BlockUsage[];
	asideBlocks: BlockUsage[];
	asideLabel: string;
	hasAside: boolean;
}

export function resolveStructuredEditorSections(
	blocks: BlockUsage[],
	editorLayout?: EditorLayoutConfig
): StructuredEditorSections {
	const asideIds = editorLayout?.aside ?? [];

	if (asideIds.length === 0) {
		return {
			primaryBlocks: blocks,
			asideBlocks: [],
			asideLabel: editorLayout?.asideLabel ?? DEFAULT_EDITOR_ASIDE_LABEL,
			hasAside: false
		};
	}

	const asideIdSet = new Set(asideIds);
	const blocksById = new Map(blocks.map((block) => [block.id, block] as const));

	return {
		primaryBlocks: blocks.filter((block) => !asideIdSet.has(block.id)),
		asideBlocks: asideIds
			.map((id) => blocksById.get(id))
			.filter((block): block is BlockUsage => block !== undefined),
		asideLabel: editorLayout?.asideLabel ?? DEFAULT_EDITOR_ASIDE_LABEL,
		hasAside: true
	};
}
