import type { Config, ConfigType, FieldDefinition } from '$lib/types/config';
import type { ContentRecord, ContentValue } from './types';

export function getContentItemId(
	configType: ConfigType,
	config: Config,
	item: ContentRecord
): string | undefined {
	if (configType === 'collection' && item._filename) {
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
	configType: ConfigType,
	config: Config,
	itemId: string
): ContentRecord | undefined {
	return items.find((item) => getContentItemId(configType, config, item) === itemId);
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
	primary: [string, FieldDefinition][];
	secondary: [string, FieldDefinition][];
}
