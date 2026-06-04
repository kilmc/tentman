import type { DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import {
	getOrderedCollectionRecords,
	orderDiscoveredConfigs
} from '$lib/features/content-management/navigation';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { ContentDocument } from '$lib/features/content-management/types';
import { getReviewConfigHref } from './navigation';
import type { OrderChangeReview, ReviewOrderEntry } from './types';

function buildOrderEntries<T extends { id: string; label: string }>(
	items: T[]
): ReviewOrderEntry[] {
	return items.map((item, index) => ({
		id: item.id,
		label: item.label,
		position: index + 1
	}));
}

function orderChanged(before: ReviewOrderEntry[], after: ReviewOrderEntry[]): boolean {
	if (before.length !== after.length) {
		return true;
	}

	return before.some((entry, index) => entry.id !== after[index]?.id);
}

export function buildTopLevelOrderChangeReview(
	baseConfigs: DiscoveredConfig[],
	draftConfigs: DiscoveredConfig[],
	baseManifest: NavigationManifestState,
	draftManifest: NavigationManifestState,
	baseRootConfig: RootConfig | null,
	draftRootConfig: RootConfig | null
): OrderChangeReview | null {
	const before = orderDiscoveredConfigs(baseConfigs, baseManifest.manifest, baseRootConfig).map(
		(config) => ({
			id: config.slug,
			label: config.config.label
		})
	);
	const after = orderDiscoveredConfigs(draftConfigs, draftManifest.manifest, draftRootConfig).map(
		(config) => ({
			id: config.slug,
			label: config.config.label
		})
	);

	const beforeEntries = buildOrderEntries(before);
	const afterEntries = buildOrderEntries(after);
	if (!orderChanged(beforeEntries, afterEntries)) {
		return null;
	}

	return {
		title: 'Top-level content order',
		href: '/pages',
		before: beforeEntries,
		after: afterEntries
	};
}

export function buildCollectionOrderChangeReview(input: {
	config: DiscoveredConfig;
	beforeContent: ContentDocument;
	afterContent: ContentDocument;
	baseManifest: NavigationManifestState;
	draftManifest: NavigationManifestState;
	baseRootConfig: RootConfig | null;
	draftRootConfig: RootConfig | null;
}): OrderChangeReview | null {
	if (!input.config.config.collection) {
		return null;
	}

	const beforeRecords = getOrderedCollectionRecords(
		input.config.config,
		input.beforeContent,
		input.baseManifest.manifest,
		input.baseRootConfig
	);
	const afterRecords = getOrderedCollectionRecords(
		input.config.config,
		input.afterContent,
		input.draftManifest.manifest,
		input.draftRootConfig
	);

	const before = buildOrderEntries(
		[...beforeRecords.groups.flatMap((group) => group.items), ...beforeRecords.items].map(
			(item) => ({
				id: item.itemId,
				label: item.title
			})
		)
	);
	const after = buildOrderEntries(
		[...afterRecords.groups.flatMap((group) => group.items), ...afterRecords.items].map((item) => ({
			id: item.itemId,
			label: item.title
		}))
	);

	if (!orderChanged(before, after)) {
		return null;
	}

	return {
		title: `${input.config.config.label} order`,
		href: getReviewConfigHref(input.config.slug, true),
		before,
		after
	};
}
