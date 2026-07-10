import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

export const TAG_VALUE_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function normalizeTagInput(value: string): string {
	return value.trim().toLowerCase();
}

export function isValidTagValue(value: string): boolean {
	return TAG_VALUE_PATTERN.test(value);
}

export function splitTagInput(value: string): string[] {
	return value
		.split(/[\s,]+/)
		.map(normalizeTagInput)
		.filter(Boolean);
}

export function normalizeTagList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seenTags = new Set<string>();
	const tags: string[] = [];

	for (const item of value) {
		if (typeof item !== 'string') {
			continue;
		}

		const tag = normalizeTagInput(item);
		if (!tag || seenTags.has(tag)) {
			continue;
		}

		seenTags.add(tag);
		tags.push(tag);
	}

	return tags;
}

export function addTagsToList(value: unknown, candidates: string[]): string[] {
	const tags = normalizeTagList(value);
	const seenTags = new Set(tags);

	for (const candidate of candidates) {
		const tag = normalizeTagInput(candidate);
		if (!tag || seenTags.has(tag)) {
			continue;
		}

		seenTags.add(tag);
		tags.push(tag);
	}

	return tags;
}

export function removeTagFromList(value: unknown, tag: string): string[] {
	const normalizedTag = normalizeTagInput(tag);
	return normalizeTagList(value).filter((candidate) => candidate !== normalizedTag);
}

export function getTagValidationMessage(tag: string): string | null {
	if (!tag) {
		return null;
	}

	return isValidTagValue(tag)
		? null
		: 'Use lowercase letters, numbers, hyphens, and underscores';
}

export function filterTagSuggestions(input: {
	query: string;
	suggestions: string[];
	selectedTags: string[];
	limit?: number;
}): string[] {
	const query = normalizeTagInput(input.query);
	const selectedTags = new Set(input.selectedTags.map(normalizeTagInput));

	return input.suggestions
		.map(normalizeTagInput)
		.filter((tag) => tag && !selectedTags.has(tag))
		.filter((tag, index, tags) => tags.indexOf(tag) === index)
		.filter((tag) => !query || tag.includes(query))
		.sort((left, right) => {
			const leftStartsWithQuery = query && left.startsWith(query);
			const rightStartsWithQuery = query && right.startsWith(query);

			if (leftStartsWithQuery !== rightStartsWithQuery) {
				return leftStartsWithQuery ? -1 : 1;
			}

			return left.localeCompare(right);
		})
		.slice(0, input.limit ?? 8);
}

function collectTagsFromValue(value: ContentValue | undefined): string[] {
	return normalizeTagList(value);
}

function collectTagBlockIds(blocks: BlockUsage[]): string[] {
	return blocks.flatMap((block) => {
		if (block.type === 'tags') {
			return [block.id];
		}

		return block.type === 'block' && Array.isArray(block.blocks)
			? collectTagBlockIds(block.blocks)
			: [];
	});
}

export function buildTagSuggestionsByField(
	blocks: BlockUsage[],
	items: ContentRecord[]
): Record<string, string[]> {
	const tagBlockIds = collectTagBlockIds(blocks);
	const suggestionsByField: Record<string, string[]> = {};

	for (const blockId of tagBlockIds) {
		const tags = new Set<string>();

		for (const item of items) {
			for (const tag of collectTagsFromValue(item[blockId])) {
				tags.add(tag);
			}
		}

		suggestionsByField[blockId] = [...tags].sort((left, right) => left.localeCompare(right));
	}

	return suggestionsByField;
}
