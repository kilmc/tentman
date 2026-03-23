import type { ParsedContentConfig } from '$lib/config/parse';
import { getCardFields } from '$lib/features/forms/helpers';
import { formatContentValue, getContentItemId } from '$lib/features/content-management/item';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';

export interface CollectionNavigationItem {
	itemId: string;
	title: string;
}

export function getConfigItemLabel(config: ParsedContentConfig): string {
	if (config.itemLabel?.trim()) {
		return config.itemLabel.trim();
	}

	const label = config.label.trim();
	if (!label) {
		return 'Item';
	}

	return label.endsWith('s') && label.length > 1 ? label.slice(0, -1) : label;
}

export function getContentItemTitle(config: ParsedContentConfig, item: ContentRecord): string {
	const cardFields = getCardFields(config);
	const seenFieldIds = new Set<string>();

	for (const block of [...cardFields.primary, ...cardFields.secondary, ...config.blocks]) {
		if (seenFieldIds.has(block.id)) {
			continue;
		}

		seenFieldIds.add(block.id);

		const value = item[block.id];
		if (value === undefined || value === null || value === '') {
			continue;
		}

		const formattedValue = formatContentValue(value);
		if (formattedValue === '—' || formattedValue === '[Object]') {
			continue;
		}

		return formattedValue;
	}

	return item._filename ?? getContentItemId(config, item) ?? getConfigItemLabel(config);
}

export function getCollectionNavigationItems(
	config: ParsedContentConfig,
	content: ContentDocument
): CollectionNavigationItem[] {
	if (!config.collection || !Array.isArray(content)) {
		return [];
	}

	return content.flatMap((item) => {
		const itemId = getContentItemId(config, item);

		if (!itemId) {
			return [];
		}

		return [
			{
				itemId,
				title: getContentItemTitle(config, item)
			}
		];
	});
}
