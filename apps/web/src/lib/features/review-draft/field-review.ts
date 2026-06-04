import type { BlockUsage } from '$lib/config/types';
import { formatContentValue } from '$lib/features/content-management/item';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
import { buildRepoAssetPreviewUrl } from './navigation';
import { buildInlineDiff, buildLineDiff } from './text-diff';
import type {
	ReviewFieldChange,
	ReviewFieldPresentation,
	ReviewObjectRow,
	ReviewStructuredEntry
} from './types';

interface RepoAssetContext {
	owner: string;
	repo: string;
	baseBranch: string;
	draftBranch: string;
}

export interface BuildFieldReviewOptions {
	repoAssetContext: RepoAssetContext;
}

type StructuredBlock = Extract<BlockUsage, { type: 'block' }>;

function isStructuredBlock(block: BlockUsage): block is StructuredBlock {
	return block.type === 'block' && Array.isArray((block as StructuredBlock).blocks);
}

function isPlainObject(value: unknown): value is ContentRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(left: ContentValue | undefined, right: ContentValue | undefined): boolean {
	return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function humanizeKey(value: string): string {
	return value
		.replace(/^_/, '')
		.replace(/([A-Z])/g, ' $1')
		.replace(/[_-]/g, ' ')
		.replace(/^./, (character) => character.toUpperCase())
		.trim();
}

function isLongText(value: string | null): boolean {
	if (!value) {
		return false;
	}

	return value.length > 500 || value.split('\n').length > 12;
}

function getTextPresentation(
	kind: 'text' | 'markdown',
	before: string | null,
	after: string | null
): ReviewFieldPresentation {
	if (before === after) {
		return {
			kind,
			before,
			after,
			diffMode: 'none',
			isLong: isLongText(after)
		};
	}

	const shouldUseLineDiff =
		(before?.includes('\n') ?? false) ||
		(after?.includes('\n') ?? false) ||
		Math.max(before?.length ?? 0, after?.length ?? 0) > 140;

	if (shouldUseLineDiff) {
		const { beforeLines, afterLines } = buildLineDiff(before ?? '', after ?? '');
		return {
			kind,
			before,
			after,
			diffMode: 'lines',
			beforeLines,
			afterLines,
			isLong: true
		};
	}

	const { beforeSegments, afterSegments } = buildInlineDiff(before ?? '', after ?? '');
	return {
		kind,
		before,
		after,
		diffMode: 'inline',
		beforeSegments,
		afterSegments,
		isLong: isLongText(before) || isLongText(after)
	};
}

function buildObjectRows(value: ContentRecord | null): ReviewObjectRow[] {
	if (!value) {
		return [];
	}

	return Object.entries(value)
		.filter(([key]) => key !== '_tentmanId' && key !== '_filename')
		.map(([key, entryValue]) => ({
			label: humanizeKey(key),
			value: formatContentValue(entryValue)
		}));
}

function summarizeStructuredObject(
	blocks: BlockUsage[],
	value: ContentRecord,
	index: number
): string {
	for (const block of blocks) {
		const blockValue = value[block.id];
		if (blockValue === undefined || blockValue === null || blockValue === '') {
			continue;
		}

		const formatted = formatContentValue(blockValue);
		if (formatted !== '—' && formatted !== '[Object]') {
			return formatted;
		}
	}

	return `Item ${index + 1}`;
}

function getStructuredStableKey(value: ContentValue | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'object' || Array.isArray(value)) {
		return `primitive:${JSON.stringify(value)}`;
	}

	for (const key of ['_tentmanId', 'id', 'slug', 'route', 'path', '_filename']) {
		const candidate = value[key];
		if (typeof candidate === 'string' && candidate.length > 0) {
			return `${key}:${candidate}`;
		}
	}

	return null;
}

function buildStructuredSummary(
	blocks: BlockUsage[],
	value: ContentValue | undefined,
	index: number
): string {
	if (isPlainObject(value)) {
		return summarizeStructuredObject(blocks, value, index);
	}

	return formatContentValue(value);
}

interface StructuredContextDescriptor {
	occurrenceKey: string;
	summary: string;
	value: ContentValue | undefined;
	position: number;
}

function buildStructuredContextDescriptors(
	blocks: BlockUsage[],
	values: ContentValue[]
): Array<StructuredContextDescriptor | null> {
	const counters = new Map<string, number>();

	return values.map((value, index) => {
		const stableKey = getStructuredStableKey(value);
		if (!stableKey) {
			return null;
		}

		const occurrence = (counters.get(stableKey) ?? 0) + 1;
		counters.set(stableKey, occurrence);

		return {
			occurrenceKey: `${stableKey}#${occurrence}`,
			summary: buildStructuredSummary(blocks, value, index),
			value,
			position: index + 1
		};
	});
}

function appendStructuredContextNotes(summary: string, notes: string[]): string {
	if (!notes.length) {
		return summary;
	}

	return `${summary} (${notes.join(', ')})`;
}

function buildStructuredContextSummaries(
	blocks: BlockUsage[],
	beforeItems: ContentValue[],
	afterItems: ContentValue[]
): { beforeSummary: string[]; afterSummary: string[] } | null {
	const beforeDescriptors = buildStructuredContextDescriptors(blocks, beforeItems);
	const afterDescriptors = buildStructuredContextDescriptors(blocks, afterItems);
	if (
		beforeDescriptors.some((descriptor) => !descriptor) ||
		afterDescriptors.some((descriptor) => !descriptor)
	) {
		return null;
	}

	const beforeEntries = beforeDescriptors as StructuredContextDescriptor[];
	const afterEntries = afterDescriptors as StructuredContextDescriptor[];
	const beforeMap = new Map(beforeEntries.map((entry) => [entry.occurrenceKey, entry]));
	const afterMap = new Map(afterEntries.map((entry) => [entry.occurrenceKey, entry]));

	return {
		beforeSummary: beforeEntries.map((entry) => {
			const matchingAfter = afterMap.get(entry.occurrenceKey);
			const notes: string[] = [];

			if (!matchingAfter) {
				notes.push('removed');
			} else {
				if (entry.position !== matchingAfter.position) {
					notes.push(`moved to ${matchingAfter.position}`);
				}

				if (!deepEqual(entry.value, matchingAfter.value)) {
					notes.push('edited');
				}
			}

			return appendStructuredContextNotes(entry.summary, notes);
		}),
		afterSummary: afterEntries.map((entry) => {
			const matchingBefore = beforeMap.get(entry.occurrenceKey);
			const notes: string[] = [];

			if (!matchingBefore) {
				notes.push('new');
			} else {
				if (matchingBefore.position !== entry.position) {
					notes.push(`moved from ${matchingBefore.position}`);
				}

				if (!deepEqual(matchingBefore.value, entry.value)) {
					notes.push('edited');
				}
			}

			return appendStructuredContextNotes(entry.summary, notes);
		})
	};
}

function buildStructuredEntries(
	block: StructuredBlock,
	before: ContentValue | undefined,
	after: ContentValue | undefined,
	options: BuildFieldReviewOptions
): ReviewStructuredEntry[] {
	const childBlocks = block.blocks ?? [];
	const beforeItems = Array.isArray(before) ? before : [];
	const afterItems = Array.isArray(after) ? after : [];
	const maxLength = Math.max(beforeItems.length, afterItems.length);
	const entries: ReviewStructuredEntry[] = [];

	for (let index = 0; index < maxLength; index += 1) {
		const beforeEntry = beforeItems[index];
		const afterEntry = afterItems[index];

		if (!isPlainObject(beforeEntry) && !isPlainObject(afterEntry)) {
			continue;
		}

		const beforeRecord = isPlainObject(beforeEntry) ? beforeEntry : undefined;
		const afterRecord = isPlainObject(afterEntry) ? afterEntry : undefined;

		const fields = buildFieldChanges(childBlocks, beforeRecord, afterRecord, options);
		if (!fields.length) {
			continue;
		}

		entries.push({
			title: summarizeStructuredObject(childBlocks, afterRecord ?? beforeRecord ?? {}, index),
			changeKinds: [
				...(beforeRecord && afterRecord ? ['edited' as const] : []),
				...(!beforeRecord && afterRecord ? ['new' as const] : []),
				...(beforeRecord && !afterRecord ? ['deleted' as const] : [])
			],
			beforePosition: beforeRecord ? index + 1 : undefined,
			afterPosition: afterRecord ? index + 1 : undefined,
			fields
		});
	}

	return entries;
}

function buildStructuredPresentation(
	block: StructuredBlock,
	before: ContentValue | undefined,
	after: ContentValue | undefined,
	options: BuildFieldReviewOptions
): ReviewFieldPresentation {
	const childBlocks = block.blocks ?? [];

	if (block.collection) {
		const beforeItems = Array.isArray(before) ? before : [];
		const afterItems = Array.isArray(after) ? after : [];
		const beforeDescriptors = buildStructuredContextDescriptors(childBlocks, beforeItems);
		const afterDescriptors = buildStructuredContextDescriptors(childBlocks, afterItems);
		const canCompareByStableIdentity =
			beforeDescriptors.every((descriptor) => descriptor !== null) &&
			afterDescriptors.every((descriptor) => descriptor !== null);
		const beforeSerialized = beforeItems.map((entry) => JSON.stringify(entry ?? null));
		const afterSerialized = afterItems.map((entry) => JSON.stringify(entry ?? null));
		const sameLength = beforeItems.length === afterItems.length;
		const sameValues =
			sameLength &&
			[...beforeSerialized].sort().join('\n') === [...afterSerialized].sort().join('\n');
		const sameOrder =
			sameLength && beforeSerialized.every((value, index) => value === afterSerialized[index]);
		const hasStructuralChange = canCompareByStableIdentity
			? beforeDescriptors.length !== afterDescriptors.length ||
				beforeDescriptors.some(
					(descriptor, index) =>
						descriptor &&
						descriptor.occurrenceKey !==
							(afterDescriptors[index] as StructuredContextDescriptor).occurrenceKey
				)
			: !sameLength || (sameValues && !sameOrder);

		if (hasStructuralChange) {
			const contextualSummaries = buildStructuredContextSummaries(
				childBlocks,
				beforeItems,
				afterItems
			);

			return {
				kind: 'structured',
				mode: 'context',
				beforeSummary:
					contextualSummaries?.beforeSummary ??
					beforeItems.map((entry, index) => buildStructuredSummary(childBlocks, entry, index)),
				afterSummary:
					contextualSummaries?.afterSummary ??
					afterItems.map((entry, index) => buildStructuredSummary(childBlocks, entry, index))
			};
		}

		return {
			kind: 'structured',
			mode: 'nested',
			entries: buildStructuredEntries(block, before, after, options)
		};
	}

	return {
		kind: 'structured',
		mode: 'nested',
		entries: [
			{
				title: block.label ?? humanizeKey(block.id),
				changeKinds: ['edited'],
				fields: buildFieldChanges(
					childBlocks,
					isPlainObject(before) ? before : undefined,
					isPlainObject(after) ? after : undefined,
					options
				)
			}
		]
	};
}

function buildPrimitivePresentation(
	block: BlockUsage | null,
	before: ContentValue | undefined,
	after: ContentValue | undefined,
	options: BuildFieldReviewOptions
): ReviewFieldPresentation {
	if (block?.type === 'markdown') {
		return getTextPresentation(
			'markdown',
			typeof before === 'string' ? before : before == null ? null : String(before),
			typeof after === 'string' ? after : after == null ? null : String(after)
		);
	}

	if (
		typeof before === 'string' ||
		typeof after === 'string' ||
		block?.type === 'text' ||
		block?.type === 'textarea'
	) {
		return getTextPresentation(
			'text',
			typeof before === 'string' ? before : before == null ? null : String(before),
			typeof after === 'string' ? after : after == null ? null : String(after)
		);
	}

	if (block?.type === 'image' && (typeof before === 'string' || typeof after === 'string')) {
		return {
			kind: 'media',
			before:
				typeof before === 'string'
					? {
							value: before,
							previewUrl: buildRepoAssetPreviewUrl({
								owner: options.repoAssetContext.owner,
								repo: options.repoAssetContext.repo,
								ref: options.repoAssetContext.baseBranch,
								value: before,
								assetsDir: block.assetsDir
							})
						}
					: null,
			after:
				typeof after === 'string'
					? {
							value: after,
							previewUrl: buildRepoAssetPreviewUrl({
								owner: options.repoAssetContext.owner,
								repo: options.repoAssetContext.repo,
								ref: options.repoAssetContext.draftBranch,
								value: after,
								assetsDir: block.assetsDir
							})
						}
					: null
		};
	}

	if (isPlainObject(before) || isPlainObject(after)) {
		return {
			kind: 'object',
			before: buildObjectRows(isPlainObject(before) ? before : null),
			after: buildObjectRows(isPlainObject(after) ? after : null)
		};
	}

	return {
		kind: 'value',
		before: before === undefined ? null : formatContentValue(before),
		after: after === undefined ? null : formatContentValue(after)
	};
}

function createFieldChange(
	fieldId: string,
	label: string,
	presentation: ReviewFieldPresentation
): ReviewFieldChange {
	const defaultExpanded = !('isLong' in presentation) || !presentation.isLong;

	return {
		fieldId,
		label,
		presentation,
		defaultExpanded
	};
}

export function buildFieldChanges(
	blocks: BlockUsage[],
	beforeRecord: ContentRecord | undefined,
	afterRecord: ContentRecord | undefined,
	options: BuildFieldReviewOptions
): ReviewFieldChange[] {
	const changes: ReviewFieldChange[] = [];
	const seenFieldIds = new Set<string>();

	for (const block of blocks) {
		seenFieldIds.add(block.id);
		const beforeValue = beforeRecord?.[block.id];
		const afterValue = afterRecord?.[block.id];

		if (deepEqual(beforeValue, afterValue)) {
			continue;
		}

		const presentation = isStructuredBlock(block)
			? buildStructuredPresentation(block, beforeValue, afterValue, options)
			: buildPrimitivePresentation(block, beforeValue, afterValue, options);

		changes.push(createFieldChange(block.id, block.label ?? humanizeKey(block.id), presentation));
	}

	const extraKeys = new Set<string>([
		...Object.keys(beforeRecord ?? {}),
		...Object.keys(afterRecord ?? {})
	]);

	for (const key of extraKeys) {
		if (seenFieldIds.has(key) || key === '_tentmanId' || key === '_filename') {
			continue;
		}

		const beforeValue = beforeRecord?.[key];
		const afterValue = afterRecord?.[key];
		if (deepEqual(beforeValue, afterValue)) {
			continue;
		}

		changes.push(
			createFieldChange(
				key,
				humanizeKey(key),
				buildPrimitivePresentation(null, beforeValue, afterValue, options)
			)
		);
	}

	return changes;
}
