import type { DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import { getItemId, getItemRoute } from '$lib/features/content-management/item';
import {
	getContentItemTitle,
	getOrderedCollectionRecords
} from '$lib/features/content-management/navigation';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import { buildFieldChanges, type BuildFieldReviewOptions } from './field-review';
import { getReviewConfigHref, getReviewItemHref, isCollectionConfig } from './navigation';
import { buildCollectionOrderChangeReview } from './structural-changes';
import type { ReviewBadge, ReviewChangeKind, ReviewItemCard, ReviewSection } from './types';

function deepEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function uniqueChangeKinds(kinds: ReviewChangeKind[]): ReviewChangeKind[] {
	return [...new Set(kinds)];
}

function buildSectionBadges(itemCards: ReviewItemCard[], hasStructuralChange: boolean): ReviewBadge[] {
	const changeKinds = new Set(itemCards.flatMap((item) => item.changeKinds));
	const badges: ReviewBadge[] = [];

	if (hasStructuralChange) {
		badges.push({ label: 'Order changed', tone: 'accent' });
	}

	if (changeKinds.has('new')) {
		badges.push({ label: 'New', tone: 'neutral' });
	}

	if (changeKinds.has('edited')) {
		badges.push({ label: 'Edited', tone: 'neutral' });
	}

	if (changeKinds.has('deleted')) {
		badges.push({ label: 'Deleted', tone: 'danger' });
	}

	if (changeKinds.has('moved')) {
		badges.push({ label: 'Moved', tone: 'accent' });
	}

	return badges;
}

function buildMergedCollectionOrder(
	beforeIds: string[],
	afterIds: string[]
): string[] {
	const merged = [...afterIds];
	const afterIdSet = new Set(afterIds);
	const deletedIds = beforeIds.filter((itemId) => !afterIdSet.has(itemId));

	for (const deletedId of deletedIds) {
		const beforeIndex = beforeIds.indexOf(deletedId);
		const insertionIndex = Math.min(beforeIndex, merged.length);
		merged.splice(insertionIndex, 0, deletedId);
	}

	return merged;
}

function getScopedItemId(config: DiscoveredConfig, item: ContentRecord): string | undefined {
	return getItemId(item) ?? getItemRoute(config.config, item);
}

function normalizeScopedCollectionIds(
	config: DiscoveredConfig,
	content: ContentRecord[]
): ContentRecord[] {
	const seenItemIds = new Set<string>();

	return content.filter((item) => {
		const itemId = getScopedItemId(config, item);
		if (!itemId || seenItemIds.has(itemId)) {
			return false;
		}

		seenItemIds.add(itemId);
		return true;
	});
}

function buildSingletonItemCard(input: {
	config: DiscoveredConfig;
	beforeRecord: ContentRecord | undefined;
	afterRecord: ContentRecord | undefined;
	fieldOptions: BuildFieldReviewOptions;
}): ReviewItemCard | null {
	if (deepEqual(input.beforeRecord, input.afterRecord)) {
		return null;
	}

	const titleSource = input.afterRecord ?? input.beforeRecord;
	const fields = buildFieldChanges(
		input.config.config.blocks,
		input.beforeRecord,
		input.afterRecord,
		input.fieldOptions
	);

	return {
		itemId: '_singleton',
		title: titleSource ? getContentItemTitle(input.config.config, titleSource) : input.config.config.label,
		href: getReviewConfigHref(input.config.slug, false),
		changeKinds: uniqueChangeKinds([
			...(input.beforeRecord && input.afterRecord ? ['edited' as const] : []),
			...(!input.beforeRecord && input.afterRecord ? ['new' as const] : []),
			...(input.beforeRecord && !input.afterRecord ? ['deleted' as const] : [])
		]),
		defaultExpanded: true,
		fields
	};
}

export function buildConfigReviewSection(input: {
	config: DiscoveredConfig;
	beforeContent: ContentDocument;
	afterContent: ContentDocument;
	baseManifest: NavigationManifestState;
	draftManifest: NavigationManifestState;
	baseRootConfig: RootConfig | null;
	draftRootConfig: RootConfig | null;
	fieldOptions: BuildFieldReviewOptions;
	singleConfigVisible: boolean;
}): ReviewSection | null {
	const isCollection = isCollectionConfig(input.config.config);
	const navigationHref = getReviewConfigHref(input.config.slug, isCollection);

	if (!isCollection) {
		const itemCard = buildSingletonItemCard({
			config: input.config,
			beforeRecord: input.beforeContent as ContentRecord | undefined,
			afterRecord: input.afterContent as ContentRecord | undefined,
			fieldOptions: input.fieldOptions
		});

		if (!itemCard) {
			return null;
		}

		return {
			configSlug: input.config.slug,
			configLabel: input.config.config.label,
			isCollection: false,
			badges: buildSectionBadges([itemCard], false),
			defaultExpanded: input.singleConfigVisible,
			navigationHref,
			collectionOrderChange: null,
			items: [itemCard]
		};
	}

	const beforeOrdered = getOrderedCollectionRecords(
		input.config.config,
		input.beforeContent,
		input.baseManifest.manifest,
		input.baseRootConfig
	);
	const afterOrdered = getOrderedCollectionRecords(
		input.config.config,
		input.afterContent,
		input.draftManifest.manifest,
		input.draftRootConfig
	);
	const beforeItems = [...beforeOrdered.groups.flatMap((group) => group.items), ...beforeOrdered.items];
	const afterItems = [...afterOrdered.groups.flatMap((group) => group.items), ...afterOrdered.items];
	const beforeMap = new Map(beforeItems.map((item, index) => [item.itemId, { ...item, position: index + 1 }]));
	const afterMap = new Map(afterItems.map((item, index) => [item.itemId, { ...item, position: index + 1 }]));
	const mergedOrder = buildMergedCollectionOrder(
		beforeItems.map((item) => item.itemId),
		afterItems.map((item) => item.itemId)
	);
	const itemCards: ReviewItemCard[] = [];

	for (const itemId of mergedOrder) {
		const beforeItem = beforeMap.get(itemId);
		const afterItem = afterMap.get(itemId);
		const beforeRecord = beforeItem?.item;
		const afterRecord = afterItem?.item;
		const hasEdit = Boolean(beforeRecord && afterRecord && !deepEqual(beforeRecord, afterRecord));
		const hasMove =
			typeof beforeItem?.position === 'number' &&
			typeof afterItem?.position === 'number' &&
			beforeItem.position !== afterItem.position;
		const changeKinds = uniqueChangeKinds([
			...(hasEdit ? ['edited' as const] : []),
			...(!beforeRecord && afterRecord ? ['new' as const] : []),
			...(beforeRecord && !afterRecord ? ['deleted' as const] : []),
			...(hasMove ? ['moved' as const] : [])
		]);

		if (!changeKinds.length) {
			continue;
		}

		const fields =
			beforeRecord || afterRecord
				? buildFieldChanges(
						input.config.config.blocks,
						beforeRecord,
						afterRecord,
						input.fieldOptions
					)
				: [];

		itemCards.push({
			itemId,
			title:
				afterRecord || beforeRecord
					? getContentItemTitle(input.config.config, (afterRecord ?? beforeRecord) as ContentRecord)
					: itemId,
			href: getReviewItemHref(input.config.slug, itemId),
			changeKinds,
			defaultExpanded: false,
			beforePosition: beforeItem?.position,
			afterPosition: afterItem?.position,
			fields
		});
	}

	const collectionOrderChange = buildCollectionOrderChangeReview({
		config: input.config,
		beforeContent: input.beforeContent,
		afterContent: input.afterContent,
		baseManifest: input.baseManifest,
		draftManifest: input.draftManifest,
		baseRootConfig: input.baseRootConfig,
		draftRootConfig: input.draftRootConfig
	});

	if (!itemCards.length && !collectionOrderChange) {
		return null;
	}

	const defaultExpanded =
		input.singleConfigVisible || Boolean(collectionOrderChange);
	const finalItemCards = itemCards.map((item, index) => ({
		...item,
		defaultExpanded: defaultExpanded && itemCards.length === 1 ? true : index === 0 && itemCards.length === 1
	}));

	return {
		configSlug: input.config.slug,
		configLabel: input.config.config.label,
		isCollection: true,
		badges: buildSectionBadges(finalItemCards, Boolean(collectionOrderChange)),
		defaultExpanded,
		navigationHref,
		collectionOrderChange,
		items: finalItemCards
	};
}

export function buildScopedCollectionItemsReviewSection(input: {
	config: DiscoveredConfig;
	beforeContent: ContentRecord[];
	afterContent: ContentRecord[];
	fieldOptions: BuildFieldReviewOptions;
	singleConfigVisible: boolean;
}): ReviewSection | null {
	const beforeContent = normalizeScopedCollectionIds(input.config, input.beforeContent);
	const afterContent = normalizeScopedCollectionIds(input.config, input.afterContent);
	const beforeMap = new Map(beforeContent.map((item) => [getScopedItemId(input.config, item), item]));
	const afterMap = new Map(afterContent.map((item) => [getScopedItemId(input.config, item), item]));
	const itemIds = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].filter(
		(itemId): itemId is string => Boolean(itemId)
	);
	const itemCards: ReviewItemCard[] = [];

	for (const itemId of itemIds) {
		const beforeRecord = beforeMap.get(itemId);
		const afterRecord = afterMap.get(itemId);
		const hasEdit = Boolean(beforeRecord && afterRecord && !deepEqual(beforeRecord, afterRecord));
		const changeKinds = uniqueChangeKinds([
			...(hasEdit ? ['edited' as const] : []),
			...(!beforeRecord && afterRecord ? ['new' as const] : []),
			...(beforeRecord && !afterRecord ? ['deleted' as const] : [])
		]);

		if (!changeKinds.length) {
			continue;
		}

		const titleSource = afterRecord ?? beforeRecord;
		itemCards.push({
			itemId,
			title: titleSource ? getContentItemTitle(input.config.config, titleSource) : itemId,
			href: getReviewItemHref(input.config.slug, itemId),
			changeKinds,
			defaultExpanded: false,
			fields: buildFieldChanges(
				input.config.config.blocks,
				beforeRecord,
				afterRecord,
				input.fieldOptions
			)
		});
	}

	if (!itemCards.length) {
		return null;
	}

	const defaultExpanded = input.singleConfigVisible;
	const finalItemCards = itemCards.map((item) => ({
		...item,
		defaultExpanded: defaultExpanded && itemCards.length === 1
	}));

	return {
		configSlug: input.config.slug,
		configLabel: input.config.config.label,
		isCollection: true,
		badges: buildSectionBadges(finalItemCards, false),
		defaultExpanded,
		navigationHref: getReviewConfigHref(input.config.slug, true),
		collectionOrderChange: null,
		items: finalItemCards
	};
}
