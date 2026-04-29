import type { ParsedContentConfig } from '$lib/config/parse';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord, ContentValue } from './types';

export function getItemId(item: ContentRecord): string | undefined {
	return typeof item._tentmanId === 'string' && item._tentmanId.length > 0
		? item._tentmanId
		: undefined;
}

export function getItemSlug(
	config: ParsedContentConfig,
	item: ContentRecord
): string | undefined {
	if (!config.idField) {
		return undefined;
	}

	const value = item[config.idField];
	return value !== undefined ? String(value) : undefined;
}

export function getItemFilename(item: ContentRecord): string | undefined {
	return typeof item._filename === 'string' && item._filename.length > 0 ? item._filename : undefined;
}

export function getItemPath(item: ContentRecord): string | undefined {
	return getItemFilename(item);
}

export function getItemRoute(
	config: ParsedContentConfig,
	item: ContentRecord
): string | undefined {
	return getItemSlug(config, item) ?? getItemId(item);
}

export function findContentItem(
	items: ContentRecord[],
	itemId: string
): ContentRecord | undefined {
	return items.find((item) => getItemId(item) === itemId || item._tentmanId === itemId);
}

export function findContentItemByRoute(
	items: ContentRecord[],
	config: ParsedContentConfig,
	itemRoute: string
): ContentRecord | undefined {
	return items.find(
		(item) => getItemRoute(config, item) === itemRoute || getItemId(item) === itemRoute
	);
}

export function formatContentValue(value: ContentValue | undefined): string {
	if (value === null || value === undefined) return '—';
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (Array.isArray(value)) return `[${value.length} items]`;

	if (value instanceof Date) {
		return value.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}
	}

	if (typeof value === 'object') return '[Object]';
	return String(value);
}

export interface CardFields {
	primary: BlockUsage[];
	secondary: BlockUsage[];
}
