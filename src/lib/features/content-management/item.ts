import type { BlockUsage, Config } from '$lib/types/config';
import type { ContentRecord, ContentValue } from './types';

export function getContentItemId(config: Config, item: ContentRecord): string | undefined {
	if (config.content.mode === 'directory' && item._filename) {
		return item._filename.replace(/\.[^/.]+$/, '');
	}

	if (config.idField) {
		const value = item[config.idField];
		return value !== undefined ? String(value) : undefined;
	}

	return undefined;
}

export function findContentItem(
	items: ContentRecord[],
	config: Config,
	itemId: string
): ContentRecord | undefined {
	return items.find((item) => getContentItemId(config, item) === itemId);
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
