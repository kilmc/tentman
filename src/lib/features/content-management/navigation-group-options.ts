import type {
	NavigationGroupsSelectBlockOptions,
	SelectBlockOption,
	SelectBlockOptions
} from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';

export interface NewNavigationGroupInput {
	collection: string;
	id: string;
	label: string;
}

export function isStaticSelectOptions(options: SelectBlockOptions | undefined): boolean {
	return Array.isArray(options);
}

export function isNavigationGroupsSelectOptions(
	options: SelectBlockOptions | undefined
): options is NavigationGroupsSelectBlockOptions {
	return (
		!!options &&
		!Array.isArray(options) &&
		options.source === 'tentman.navigationGroups'
	);
}

export function getSelectOptionsFromNavigationGroups(
	manifest: NavigationManifest | null | undefined,
	collectionId: string
): SelectBlockOption[] {
	const groups = manifest?.collections?.[collectionId]?.groups ?? [];

	return groups.map((group) => ({
		value: group.id,
		label: group.label || group.id
	}));
}

export function resolveSelectOptions(
	options: SelectBlockOptions | undefined,
	manifest: NavigationManifest | null | undefined
): SelectBlockOption[] {
	if (!options) {
		return [];
	}

	if (Array.isArray(options)) {
		return options;
	}

	if (isNavigationGroupsSelectOptions(options)) {
		return getSelectOptionsFromNavigationGroups(manifest, options.collection);
	}

	return [];
}

export function slugifyNavigationGroupLabel(label: string): string {
	const slug = label
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug || 'group';
}

export function addNavigationGroupToManifest(
	manifest: NavigationManifest | null | undefined,
	input: NewNavigationGroupInput
): NavigationManifest {
	const id = input.id.trim();
	const label = input.label.trim();

	if (!input.collection.trim()) {
		throw new Error('Collection is required');
	}

	if (!id) {
		throw new Error('Group id is required');
	}

	if (!label) {
		throw new Error('Group title is required');
	}

	const nextManifest: NavigationManifest = manifest
		? {
				...manifest,
				content: manifest.content ? { items: [...manifest.content.items] } : undefined,
				collections: manifest.collections
					? Object.fromEntries(
							Object.entries(manifest.collections).map(([collectionId, collection]) => [
								collectionId,
								{
									items: [...collection.items],
									...(collection.groups
									? {
												groups: collection.groups.map((group) => ({
													id: group.id,
													...(group.label && { label: group.label }),
													items: [...group.items]
												}))
											}
										: {})
								}
							])
						)
					: undefined
			}
		: { version: 1 };

	const collections = nextManifest.collections ?? {};
	const collection = collections[input.collection] ?? { items: [] };
	const groups = collection.groups ?? [];

	if (groups.some((group) => group.id === id)) {
		throw new Error(`A group with id "${id}" already exists`);
	}

	nextManifest.collections = {
		...collections,
		[input.collection]: {
			items: [...collection.items],
			groups: [
				...groups,
				{
					id,
					label,
					items: []
				}
			]
		}
	};

	return nextManifest;
}
