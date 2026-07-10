import type {
	BlockUsage,
	CollectionSortDirection,
	NormalizedCollectionSortConfig
} from '$lib/config/types';
import type { ParsedContentConfig } from '$lib/config/parse';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

export type CollectionSortValue = string | number | null;

export interface ResolvedCollectionSort {
	id: string;
	type: 'manual' | 'title' | 'text' | 'date' | 'filename';
	label: string;
	defaultDirection?: CollectionSortDirection;
	blockId?: string;
}

export interface ResolvedCollectionSortCapabilities {
	sorts: ResolvedCollectionSort[];
	defaultSortId: string | null;
	defaultDirection?: CollectionSortDirection;
	ordering: boolean;
}

function getNaturalDirection(sort: ResolvedCollectionSort): CollectionSortDirection | undefined {
	if (sort.type === 'manual') {
		return undefined;
	}

	return sort.defaultDirection ?? (sort.type === 'date' ? 'desc' : 'asc');
}

function getCollectionObject(config: ParsedContentConfig) {
	return config.collection && config.collection !== true && typeof config.collection === 'object'
		? config.collection
		: null;
}

function toExplicitSort(sort: NormalizedCollectionSortConfig): ResolvedCollectionSort {
	return {
		id: sort.id,
		type: sort.type,
		label: sort.label ?? (sort.type === 'title' ? 'Title' : sort.blockId),
		...(sort.defaultDirection ? { defaultDirection: sort.defaultDirection } : {}),
		...('blockId' in sort ? { blockId: sort.blockId } : {})
	};
}

function getUniqueSortId(baseId: string, usedIds: Set<string>): string {
	if (!usedIds.has(baseId)) {
		usedIds.add(baseId);
		return baseId;
	}

	let suffix = 2;
	while (usedIds.has(`${baseId}-${suffix}`)) {
		suffix += 1;
	}

	const id = `${baseId}-${suffix}`;
	usedIds.add(id);
	return id;
}

function getExplicitItemLabelBlock(blocks: BlockUsage[]): BlockUsage | null {
	const explicitBlocks = blocks.filter((block) => block.isItemLabel === true);
	return explicitBlocks.length === 1 ? (explicitBlocks[0] ?? null) : null;
}

function isTitleBlock(block: BlockUsage): boolean {
	return (
		['text', 'textarea', 'markdown'].includes(block.type) &&
		(block.id === 'title' || block.label?.trim().toLowerCase() === 'title')
	);
}

function getInferredSorts(blocks: BlockUsage[]): ResolvedCollectionSort[] {
	const usedIds = new Set<string>();
	const explicitLabelBlock = getExplicitItemLabelBlock(blocks);

	if (explicitLabelBlock?.type === 'date') {
		return [
			{
				id: getUniqueSortId(explicitLabelBlock.id, usedIds),
				type: 'date',
				blockId: explicitLabelBlock.id,
				label: explicitLabelBlock.label ?? explicitLabelBlock.id
			}
		];
	}

	if (explicitLabelBlock && ['text', 'textarea', 'markdown'].includes(explicitLabelBlock.type)) {
		return [
			{
				id: getUniqueSortId('title', usedIds),
				type: 'title',
				label: explicitLabelBlock.label ?? 'Title'
			}
		];
	}

	const titleBlock = blocks.find(isTitleBlock);
	if (titleBlock) {
		return [
			{
				id: getUniqueSortId('title', usedIds),
				type: 'title',
				label: titleBlock.label ?? 'Title'
			}
		];
	}

	const dateBlock = blocks.find((block) => block.type === 'date');
	if (dateBlock) {
		return [
			{
				id: getUniqueSortId(dateBlock.id, usedIds),
				type: 'date',
				blockId: dateBlock.id,
				label: dateBlock.label ?? dateBlock.id
			}
		];
	}

	return [
		{
			id: getUniqueSortId('filename', usedIds),
			type: 'filename',
			label: 'Filename'
		}
	];
}

export function resolveCollectionSortCapabilities(
	config: ParsedContentConfig,
	options: { canOrderItems?: boolean } = {}
): ResolvedCollectionSortCapabilities {
	const collection = getCollectionObject(config);
	const canOrderItems = options.canOrderItems ?? true;
	const manualSort: ResolvedCollectionSort[] =
		collection?.ordering === true && canOrderItems
			? [{ id: 'manual', type: 'manual', label: 'Custom' }]
			: [];
	const configuredSorts = collection?.sorts?.map(toExplicitSort);
	const sorts = [...manualSort, ...(configuredSorts ?? getInferredSorts(config.blocks))];
	const configuredDefaultSort =
		typeof collection?.defaultSort === 'string'
			? { id: collection.defaultSort }
			: collection?.defaultSort;
	const defaultSort =
		(configuredDefaultSort
			? sorts.find((sort) => sort.id === configuredDefaultSort.id)
			: undefined) ??
		manualSort[0] ??
		null;

	return {
		sorts,
		defaultSortId: defaultSort?.id ?? null,
		...(defaultSort
			? { defaultDirection: configuredDefaultSort?.direction ?? getNaturalDirection(defaultSort) }
			: {}),
		ordering: collection?.ordering === true
	};
}

function normalizeTextSortValue(value: ContentValue | undefined): string | null {
	if (value === null || value === undefined || Array.isArray(value) || typeof value === 'object') {
		return null;
	}

	const normalized = String(value).trim().replace(/\s+/g, ' ');
	return normalized.length > 0 ? normalized : null;
}

function normalizeDateSortValue(value: ContentValue | undefined): number | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const parsed = new Date(String(value));
	const timestamp = parsed.getTime();

	return Number.isNaN(timestamp) ? null : timestamp;
}

export function getCollectionSortValues(
	config: ParsedContentConfig,
	item: ContentRecord,
	title: string
): Record<string, CollectionSortValue> {
	const values: Record<string, CollectionSortValue> = {};

	for (const sort of resolveCollectionSortCapabilities(config).sorts) {
		if (sort.type === 'manual') {
			continue;
		}

		if (sort.type === 'title') {
			values[sort.id] = title;
			continue;
		}

		if (sort.type === 'filename') {
			values[sort.id] = normalizeTextSortValue(item._filename) ?? title;
			continue;
		}

		if (!sort.blockId) {
			continue;
		}

		values[sort.id] =
			sort.type === 'date'
				? normalizeDateSortValue(item[sort.blockId])
				: normalizeTextSortValue(item[sort.blockId]);
	}

	return values;
}
