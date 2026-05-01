import type {
	NavigationManifestCollection,
	SelectBlockOption,
	SelectBlockOptions,
	TentmanGroupBlockUsage
} from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import { createTentmanId } from '$lib/features/content-management/stable-identity';

export interface NewNavigationGroupInput {
	collection: string;
	id: string;
	value: string;
	label: string;
}

export function isStaticSelectOptions(options: SelectBlockOptions | undefined): boolean {
	return Array.isArray(options);
}

export function getTentmanGroupOptions(
	block: TentmanGroupBlockUsage
): Pick<TentmanGroupBlockUsage, 'collection' | 'addOption'> {
	return {
		collection: block.collection,
		...(block.addOption !== undefined ? { addOption: block.addOption } : {})
	};
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
	return options ?? [];
}

export function deriveNavigationGroupValue(label: string): string {
	const value = label
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return value || 'group';
}

export function addNavigationGroupToManifest(
	manifest: NavigationManifest | null | undefined,
	input: NewNavigationGroupInput
): NavigationManifest {
	const id = input.id.trim();
	const value = input.value.trim();
	const label = input.label.trim();

	if (!input.collection.trim()) {
		throw new Error('Collection is required');
	}

	if (!id) {
		throw new Error('Group id is required');
	}

	if (!value) {
		throw new Error('Group value is required');
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
													...(group.value && { value: group.value }),
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

	if (groups.some((group) => group.value === value)) {
		throw new Error(`A group with value "${value}" already exists`);
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
					value,
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
		value: input.value.trim()
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
				(typeof group.value === 'string' && group.value === nextGroup.value) ||
				(typeof group.label === 'string' && group.label === nextGroup.label)
		)
	) {
		throw new Error(`A group with value "${nextGroup.value}" already exists`);
	}

	config.collection = {
		...collectionConfig,
		groups: [...currentGroups, nextGroup]
	};

	return `${JSON.stringify(config, null, '\t')}\n`;
}
