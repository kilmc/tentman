import type {
	NavigationGroupsSelectBlockOptions,
	NavigationManifestCollection,
	SelectBlockOption,
	SelectBlockOptions
} from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import { createTentmanId } from '$lib/features/content-management/stable-identity';

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
	const groups = getManifestCollectionByReference(manifest, collectionId)?.groups ?? [];

	return groups.map((group) => ({
		value: group.id,
		label: group.label || group.id
	}));
}

function getManifestCollectionByReference(
	manifest: NavigationManifest | null | undefined,
	collectionReference: string
): NavigationManifestCollection | null {
	if (!manifest?.collections || !collectionReference.trim()) {
		return null;
	}

	const directMatch = manifest.collections[collectionReference];
	if (directMatch) {
		return directMatch;
	}

	for (const [key, collection] of Object.entries(manifest.collections)) {
		if (
			key === collectionReference ||
			collection.configId === collectionReference ||
			collection.id === collectionReference ||
			collection.slug === collectionReference
		) {
			return collection;
		}
	}

	return null;
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
									...(collection.id ? { id: collection.id } : {}),
									...(collection.label ? { label: collection.label } : {}),
									...(collection.slug ? { slug: collection.slug } : {}),
									...(collection.href ? { href: collection.href } : {}),
									...(collection.configId ? { configId: collection.configId } : {}),
									items: [...collection.items],
									...(collection.groups
									? {
												groups: collection.groups.map((group) => ({
													id: group.id,
													...(group.label && { label: group.label }),
													...(group.slug && { slug: group.slug }),
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
	const resolvedCollectionKey =
		Object.entries(collections).find(([_key, collection]) => {
			return (
				collection.configId === input.collection ||
				collection.id === input.collection ||
				collection.slug === input.collection
			);
		})?.[0] ?? input.collection;
	const collection = collections[resolvedCollectionKey] ?? { items: [] };
	const groups = collection.groups ?? [];

	if (groups.some((group) => group.id === id)) {
		throw new Error(`A group with id "${id}" already exists`);
	}

	nextManifest.collections = {
		...collections,
		[resolvedCollectionKey]: {
			...collection,
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

export function addCollectionGroupToConfigSource(
	source: string,
	input: NewNavigationGroupInput
): string {
	const parsed = JSON.parse(source) as unknown;

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Content config must be a JSON object');
	}

	const config = parsed as Record<string, unknown>;
	if (config.type !== 'content') {
		throw new Error('Only content configs can receive collection groups');
	}

	const collection = config.collection;
	const nextGroup = {
		_tentmanId: createTentmanId(),
		label: input.label.trim(),
		slug: input.id.trim()
	};

	if (collection === true) {
		config.collection = {
			groups: [nextGroup]
		};
		return `${JSON.stringify(config, null, '\t')}\n`;
	}

	if (!collection || typeof collection !== 'object' || Array.isArray(collection)) {
		throw new Error('Collection groups can only be added to collection content configs');
	}

	const collectionConfig = collection as Record<string, unknown>;
	const currentGroups = Array.isArray(collectionConfig.groups)
		? (collectionConfig.groups as Array<Record<string, unknown>>)
		: [];

	if (
		currentGroups.some(
			(group) =>
				(typeof group.slug === 'string' && group.slug === nextGroup.slug) ||
				(typeof group.label === 'string' && group.label === nextGroup.label)
		)
	) {
		throw new Error(`A group with slug "${nextGroup.slug}" already exists`);
	}

	config.collection = {
		...collectionConfig,
		groups: [...currentGroups, nextGroup]
	};

	return `${JSON.stringify(config, null, '\t')}\n`;
}
