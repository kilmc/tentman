import type { DiscoveredConfig } from '$lib/config/discovery';
import type { ParsedContentConfig } from '$lib/config/parse';
import { getCardFields } from '$lib/features/forms/helpers';
import { formatContentValue, getContentItemId } from '$lib/features/content-management/item';
import type {
	NavigationManifest,
	NavigationManifestCollection
} from '$lib/features/content-management/navigation-manifest';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';

export interface CollectionNavigationItem {
	itemId: string;
	title: string;
}

export interface CollectionNavigationGroup {
	id: string;
	label: string;
	items: CollectionNavigationItem[];
}

export interface OrderedCollectionRecord {
	itemId: string;
	title: string;
	item: ContentRecord;
}

export interface OrderedCollectionRecordGroup {
	id: string;
	label: string;
	items: OrderedCollectionRecord[];
}

export interface OrderedCollectionNavigation {
	items: CollectionNavigationItem[];
	groups: CollectionNavigationGroup[];
}

export interface OrderedCollectionRecords {
	items: OrderedCollectionRecord[];
	groups: OrderedCollectionRecordGroup[];
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

function orderItemsByManifest<T extends { itemId: string }>(
	items: T[],
	manifestItems: string[]
): T[] {
	const remainingItems = new Map(items.map((item) => [item.itemId, item]));
	const orderedItems: T[] = [];

	for (const itemId of manifestItems) {
		const item = remainingItems.get(itemId);
		if (!item) {
			continue;
		}

		orderedItems.push(item);
		remainingItems.delete(itemId);
	}

	for (const item of items) {
		if (!remainingItems.has(item.itemId)) {
			continue;
		}

		orderedItems.push(item);
		remainingItems.delete(item.itemId);
	}

	return orderedItems;
}

function getManifestCollection(
	manifest: NavigationManifest | null | undefined,
	config: ParsedContentConfig
): NavigationManifestCollection | null {
	if (!manifest?.collections || !config.id) {
		return null;
	}

	return manifest.collections[config.id] ?? null;
}

function splitOrderedItemsIntoGroups<T extends { itemId: string }>(
	items: T[],
	manifestCollection: NavigationManifestCollection | null
): { items: T[]; groups: Array<{ id: string; label: string; items: T[] }> } {
	if (!manifestCollection) {
		return { items, groups: [] };
	}

	const orderedItems = orderItemsByManifest(items, manifestCollection.items);

	if (!manifestCollection.groups?.length) {
		return {
			items: orderedItems,
			groups: []
		};
	}

	const itemMap = new Map(orderedItems.map((item) => [item.itemId, item]));
	const groupedItemIds = new Set<string>();
	const groups = manifestCollection.groups.map((group) => ({
		id: group.id,
		label: group.label,
		items: group.items.flatMap((itemId) => {
			const item = itemMap.get(itemId);
			if (!item) {
				return [];
			}

			groupedItemIds.add(itemId);
			return [item];
		})
	}));

	return {
		groups,
		items: orderedItems.filter((item) => !groupedItemIds.has(item.itemId))
	};
}

export function orderDiscoveredConfigs(
	configs: DiscoveredConfig[],
	manifest: NavigationManifest | null | undefined
): DiscoveredConfig[] {
	const manifestIds = manifest?.content?.items;
	if (!manifestIds?.length) {
		return configs;
	}

	const configsWithIds = configs.flatMap((config) =>
		config.config.id ? [[config.config.id, config] as const] : []
	);
	const configMap = new Map(configsWithIds);
	const orderedConfigs: DiscoveredConfig[] = [];
	const addedSlugs = new Set<string>();

	for (const configId of manifestIds) {
		const config = configMap.get(configId);
		if (!config || addedSlugs.has(config.slug)) {
			continue;
		}

		orderedConfigs.push(config);
		addedSlugs.add(config.slug);
	}

	for (const config of configs) {
		if (addedSlugs.has(config.slug)) {
			continue;
		}

		orderedConfigs.push(config);
	}

	return orderedConfigs;
}

export function getOrderedCollectionNavigation(
	config: ParsedContentConfig,
	content: ContentDocument,
	manifest: NavigationManifest | null | undefined
): OrderedCollectionNavigation {
	const items = getCollectionNavigationItems(config, content);
	return splitOrderedItemsIntoGroups(items, getManifestCollection(manifest, config));
}

export function getOrderedCollectionRecords(
	config: ParsedContentConfig,
	content: ContentDocument,
	manifest: NavigationManifest | null | undefined
): OrderedCollectionRecords {
	if (!config.collection || !Array.isArray(content)) {
		return {
			items: [],
			groups: []
		};
	}

	const records = content.flatMap((item) => {
		const itemId = getContentItemId(config, item);
		if (!itemId) {
			return [];
		}

		return [
			{
				itemId,
				title: getContentItemTitle(config, item),
				item
			}
		];
	});

	return splitOrderedItemsIntoGroups(records, getManifestCollection(manifest, config));
}
