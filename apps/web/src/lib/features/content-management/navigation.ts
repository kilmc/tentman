import type { DiscoveredConfig } from '$lib/config/discovery';
import type { ParsedContentConfig } from '$lib/config/parse';
import type { RootConfig } from '$lib/config/root-config';
import {
	getCollectionGroups,
	isCollectionManualSortingEnabled
} from '$lib/features/content-management/config';
import { getItemId, getItemRoute } from '$lib/features/content-management/item';
import {
	getConfigItemLabel,
	resolveContentItemTitle
} from '$lib/features/content-management/item-labels';
import {
	resolveCollectionItemState,
	type ResolvedContentState
} from '$lib/features/content-management/state';
import type {
	NavigationManifest,
	NavigationManifestCollection
} from '$lib/features/content-management/navigation-manifest';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';

export { getConfigItemLabel, resolveContentItemTitle } from '$lib/features/content-management/item-labels';

export interface CollectionNavigationItem {
	itemId: string;
	title: string;
	sortDate?: number | null;
	state?: ResolvedContentState | null;
}

export interface CollectionNavigationGroup {
	id: string;
	label: string;
	items: CollectionNavigationItem[];
}

export interface OrderedCollectionRecord {
	itemId: string;
	title: string;
	sortDate?: number | null;
	item: ContentRecord;
	state?: ResolvedContentState | null;
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

export function getContentItemTitle(config: ParsedContentConfig, item: ContentRecord): string {
	return resolveContentItemTitle(config, item).title;
}

export function getCollectionNavigationItems(
	config: ParsedContentConfig,
	content: ContentDocument,
	rootConfig?: RootConfig | null
): CollectionNavigationItem[] {
	if (!config.collection || !Array.isArray(content)) {
		return [];
	}

	const dateFieldId = config.blocks.find((block) => block.type === 'date')?.id;

	return content.flatMap((item) => {
		const itemId = getCollectionNavigationItemId(config, item);

		if (!itemId) {
			return [];
		}

		const state = resolveCollectionItemState(config, item, rootConfig);

		return [
			{
				itemId,
				title: getContentItemTitle(config, item),
				sortDate: getCollectionSortDate(item, dateFieldId),
				...(state ? { state } : {})
			}
		];
	});
}

function getCollectionNavigationItemId(
	config: ParsedContentConfig,
	item: ContentRecord
): string | undefined {
	const stableId = getItemId(item);
	if (stableId) {
		return stableId;
	}

	if (isCollectionManualSortingEnabled(config)) {
		return undefined;
	}

	return getItemRoute(config, item);
}

function getCollectionSortDate(item: ContentRecord, dateFieldId?: string): number | null {
	if (!dateFieldId) {
		return null;
	}

	const value = item[dateFieldId];
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const parsed = new Date(String(value));
	const timestamp = parsed.getTime();

	return Number.isNaN(timestamp) ? null : timestamp;
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
	if (!manifest?.collections || !config._tentmanId) {
		return null;
	}

	return manifest.collections[config._tentmanId] ?? null;
}

function splitOrderedItemsIntoGroups<T extends { itemId: string }>(
	items: T[],
	config: ParsedContentConfig,
	manifestCollection: NavigationManifestCollection | null
): { items: T[]; groups: Array<{ id: string; label: string; items: T[] }> } {
	if (!manifestCollection) {
		return { items, groups: [] };
	}

	const orderedItems = orderItemsByManifest(items, manifestCollection.items);
	const configGroups = getCollectionGroups(config);

	if (!configGroups.length) {
		return {
			items: orderedItems,
			groups: []
		};
	}

	const itemMap = new Map(orderedItems.map((item) => [item.itemId, item]));
	const groupedItemIds = new Set<string>();
	const groupMemberships = new Map(
		(manifestCollection.groups ?? []).map((group) => [group.id, group.items] as const)
	);
	const groups = configGroups.flatMap((group) => {
		if (!group._tentmanId) {
			return [];
		}

		return [
			{
				id: group._tentmanId,
				label: group.label,
				items: (groupMemberships.get(group._tentmanId) ?? []).flatMap((itemId) => {
					const item = itemMap.get(itemId);
					if (!item) {
						return [];
					}

					groupedItemIds.add(itemId);
					return [item];
				})
			}
		];
	});

	return {
		groups,
		items: orderedItems.filter((item) => !groupedItemIds.has(item.itemId))
	};
}

export function orderDiscoveredConfigs(
	configs: DiscoveredConfig[],
	manifest: NavigationManifest | null | undefined,
	rootConfig?: { content?: { sorting?: 'manual' } } | null
): DiscoveredConfig[] {
	if (rootConfig?.content?.sorting !== 'manual') {
		return configs;
	}

	const manifestIds = manifest?.content?.items;
	if (!manifestIds?.length) {
		return configs;
	}

	const configsWithIds = configs.flatMap((config) =>
		config.config._tentmanId ? [[config.config._tentmanId, config] as const] : []
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
	manifest: NavigationManifest | null | undefined,
	rootConfig?: RootConfig | null
): OrderedCollectionNavigation {
	const items = getCollectionNavigationItems(config, content, rootConfig);
	return splitOrderedItemsIntoGroups(items, config, getManifestCollection(manifest, config));
}

export function orderCollectionNavigationItems(
	config: ParsedContentConfig,
	items: CollectionNavigationItem[],
	manifest: NavigationManifest | null | undefined
): OrderedCollectionNavigation {
	return splitOrderedItemsIntoGroups(items, config, getManifestCollection(manifest, config));
}

export function getFirstCollectionNavigationItemId(
	navigation: OrderedCollectionNavigation
): string | null {
	for (const group of navigation.groups) {
		const firstItem = group.items[0];
		if (firstItem) {
			return firstItem.itemId;
		}
	}

	return navigation.items[0]?.itemId ?? null;
}

export function getFirstCollectionItemId(
	config: ParsedContentConfig,
	content: ContentDocument,
	manifest: NavigationManifest | null | undefined,
	rootConfig?: RootConfig | null
): string | null {
	const orderedNavigation = getOrderedCollectionNavigation(config, content, manifest, rootConfig);
	return getFirstCollectionNavigationItemId(orderedNavigation);
}

export function getOrderedCollectionRecords(
	config: ParsedContentConfig,
	content: ContentDocument,
	manifest: NavigationManifest | null | undefined,
	rootConfig?: RootConfig | null
): OrderedCollectionRecords {
	if (!config.collection || !Array.isArray(content)) {
		return {
			items: [],
			groups: []
		};
	}

	const records = content.flatMap((item) => {
		const itemId = getCollectionNavigationItemId(config, item);
		if (!itemId) {
			return [];
		}

		const state = resolveCollectionItemState(config, item, rootConfig);

		return [
			{
				itemId,
				title: getContentItemTitle(config, item),
				sortDate: getCollectionSortDate(
					item,
					config.blocks.find((block) => block.type === 'date')?.id
				),
				item,
				...(state ? { state } : {})
			}
		];
	});

	return splitOrderedItemsIntoGroups(records, config, getManifestCollection(manifest, config));
}
