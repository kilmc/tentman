import type { DiscoveredConfig } from '$lib/config/discovery';
import type {
	NavigationManifest,
	NavigationManifestGroup
} from '$lib/features/content-management/navigation-manifest';
import {
	orderDiscoveredConfigs,
	type OrderedCollectionNavigation
} from '$lib/features/content-management/navigation';

export interface NavigationDraftGroup {
	id: string;
	label: string;
	items: string[];
}

export interface NavigationDraftCollection {
	ungroupedItems: string[];
	groups: NavigationDraftGroup[];
}

export interface NavigationDraft {
	contentOrder: string[];
	collections: Record<string, NavigationDraftCollection>;
}

export type CollectionNavigationMap = Record<string, OrderedCollectionNavigation>;

function cloneGroups(
	groups: NavigationManifestGroup[] | NavigationDraftGroup[]
): NavigationDraftGroup[] {
	return groups.map((group) => ({
		id: group.id,
		label: group.label,
		items: [...group.items]
	}));
}

function getUngroupedItemsFromManifestSection(
	items: string[],
	groups: NavigationManifestGroup[] | undefined
): string[] {
	if (!groups?.length) {
		return [...items];
	}

	const groupedItemIds = new Set(groups.flatMap((group) => group.items));
	return items.filter((itemId) => !groupedItemIds.has(itemId));
}

function getCollectionDraft(
	config: DiscoveredConfig,
	manifest: NavigationManifest | null | undefined,
	collectionNavigationBySlug: CollectionNavigationMap
): NavigationDraftCollection | null {
	const configId = config.config.id;
	if (!config.config.collection || !configId) {
		return null;
	}

	const navigation = collectionNavigationBySlug[config.slug];
	if (navigation) {
		return {
			ungroupedItems: navigation.items.map((item) => item.itemId),
			groups: navigation.groups.map((group) => ({
				id: group.id,
				label: group.label,
				items: group.items.map((item) => item.itemId)
			}))
		};
	}

	const manifestSection = manifest?.collections?.[configId];
	if (!manifestSection) {
		return {
			ungroupedItems: [],
			groups: []
		};
	}

	return {
		ungroupedItems: getUngroupedItemsFromManifestSection(
			manifestSection.items,
			manifestSection.groups
		),
		groups: cloneGroups(manifestSection.groups ?? [])
	};
}

export function createNavigationDraft(
	configs: DiscoveredConfig[],
	manifest: NavigationManifest | null | undefined,
	collectionNavigationBySlug: CollectionNavigationMap
): NavigationDraft {
	const orderedConfigs = orderDiscoveredConfigs(configs, manifest);

	return {
		contentOrder: orderedConfigs.flatMap((config) => (config.config.id ? [config.config.id] : [])),
		collections: Object.fromEntries(
			orderedConfigs.flatMap((config) => {
				const draft = getCollectionDraft(config, manifest, collectionNavigationBySlug);
				if (!draft || !config.config.id) {
					return [];
				}

				return [[config.config.id, draft] as const];
			})
		)
	};
}

function cloneDraftCollection(collection: NavigationDraftCollection): NavigationDraftCollection {
	return {
		ungroupedItems: [...collection.ungroupedItems],
		groups: cloneGroups(collection.groups)
	};
}

export function cloneNavigationDraft(draft: NavigationDraft): NavigationDraft {
	return {
		contentOrder: [...draft.contentOrder],
		collections: Object.fromEntries(
			Object.entries(draft.collections).map(([configId, collection]) => [
				configId,
				cloneDraftCollection(collection)
			])
		)
	};
}

export function serializeNavigationDraft(draft: NavigationDraft): NavigationManifest {
	const collections = Object.fromEntries(
		Object.entries(draft.collections).map(([configId, collection]) => {
			const groups = cloneGroups(collection.groups);

			return [
				configId,
				{
					items: [...groups.flatMap((group) => group.items), ...collection.ungroupedItems],
					...(groups.length > 0 ? { groups } : {})
				}
			];
		})
	);

	return {
		version: 1,
		content: {
			items: [...draft.contentOrder]
		},
		...(Object.keys(collections).length > 0 ? { collections } : {})
	};
}

export function areNavigationDraftsEqual(
	left: NavigationDraft | null,
	right: NavigationDraft | null
): boolean {
	if (left === right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return (
		JSON.stringify(serializeNavigationDraft(left)) ===
		JSON.stringify(serializeNavigationDraft(right))
	);
}

export function setNavigationDraftContentOrder(
	draft: NavigationDraft,
	contentOrder: string[]
): NavigationDraft {
	return {
		...draft,
		contentOrder: [...contentOrder]
	};
}

export function setNavigationDraftCollectionUngroupedItems(
	draft: NavigationDraft,
	configId: string,
	itemIds: string[]
): NavigationDraft {
	const collection = draft.collections[configId];
	if (!collection) {
		return draft;
	}

	return {
		...draft,
		collections: {
			...draft.collections,
			[configId]: {
				...collection,
				ungroupedItems: [...itemIds]
			}
		}
	};
}

export function setNavigationDraftCollection(
	draft: NavigationDraft,
	configId: string,
	collection: NavigationDraftCollection
): NavigationDraft {
	if (!draft.collections[configId]) {
		return draft;
	}

	return {
		...draft,
		collections: {
			...draft.collections,
			[configId]: cloneDraftCollection(collection)
		}
	};
}

export function setNavigationDraftCollectionGroupItems(
	draft: NavigationDraft,
	configId: string,
	groupId: string,
	itemIds: string[]
): NavigationDraft {
	const collection = draft.collections[configId];
	if (!collection) {
		return draft;
	}

	return {
		...draft,
		collections: {
			...draft.collections,
			[configId]: {
				...collection,
				groups: collection.groups.map((group) =>
					group.id === groupId ? { ...group, items: [...itemIds] } : group
				)
			}
		}
	};
}
