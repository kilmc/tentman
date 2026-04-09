import { fetchContentDocument } from '$lib/content/service';
import type { DiscoveredConfig } from '$lib/config/discovery';
import { getContentItemId } from '$lib/features/content-management/item';
import type { ContentRecord } from '$lib/features/content-management/types';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

export const NAVIGATION_MANIFEST_PATH = 'tentman/navigation-manifest.json';

export interface NavigationManifestGroup {
	id: string;
	label: string;
	items: string[];
}

export interface NavigationManifestCollection {
	items: string[];
	groups?: NavigationManifestGroup[];
}

export interface NavigationManifest {
	version: 1;
	content?: {
		items: string[];
	};
	collections?: Record<string, NavigationManifestCollection>;
}

export interface NavigationManifestState {
	path: string;
	exists: boolean;
	manifest: NavigationManifest | null;
	error: string | null;
}

export interface MissingContentConfigId {
	path: string;
	slug: string;
	label: string;
	suggestedId: string;
}

export interface ManualNavigationCollectionSetup {
	slug: string;
	label: string;
	configId: string | null;
	idField: string | null;
	canOrderItems: boolean;
}

export interface ManualNavigationSetupState {
	status: 'inactive' | 'partial' | 'active';
	manifestPath: string;
	manifestExists: boolean;
	manifestValid: boolean;
	manifestError: string | null;
	missingConfigIds: MissingContentConfigId[];
	collections: ManualNavigationCollectionSetup[];
}

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}
}

function readStringArray(value: unknown, context: string): string[] {
	if (!Array.isArray(value)) {
		throw new Error(`${context} must be an array of strings`);
	}

	return value.map((entry, index) => {
		if (typeof entry !== 'string' || entry.length === 0) {
			throw new Error(`${context}[${index}] must be a non-empty string`);
		}

		return entry;
	});
}

function parseNavigationManifestCollection(
	value: unknown,
	context: string
): NavigationManifestCollection {
	assertObject(value, `${context} must be an object`);

	const items = readStringArray(value.items ?? [], `${context}.items`);
	const groupsValue = value.groups;

	if (groupsValue === undefined) {
		return { items };
	}

	if (!Array.isArray(groupsValue)) {
		throw new Error(`${context}.groups must be an array`);
	}

	return {
		items,
		groups: groupsValue.map((group, index) => {
			assertObject(group, `${context}.groups[${index}] must be an object`);

			if (typeof group.id !== 'string' || group.id.length === 0) {
				throw new Error(`${context}.groups[${index}].id must be a non-empty string`);
			}

			if (typeof group.label !== 'string' || group.label.length === 0) {
				throw new Error(`${context}.groups[${index}].label must be a non-empty string`);
			}

			return {
				id: group.id,
				label: group.label,
				items: readStringArray(group.items ?? [], `${context}.groups[${index}].items`)
			};
		})
	};
}

export function parseNavigationManifest(input: string): NavigationManifest {
	const parsed = JSON.parse(input) as unknown;
	assertObject(parsed, 'navigation manifest must be an object');

	if (parsed.version !== 1) {
		throw new Error('navigation manifest version must be 1');
	}

	const contentValue = parsed.content;
	const collectionsValue = parsed.collections;

	const manifest: NavigationManifest = {
		version: 1
	};

	if (contentValue !== undefined) {
		assertObject(contentValue, 'navigation manifest content must be an object');
		manifest.content = {
			items: readStringArray(contentValue.items ?? [], 'navigation manifest content.items')
		};
	}

	if (collectionsValue !== undefined) {
		assertObject(collectionsValue, 'navigation manifest collections must be an object');
		manifest.collections = Object.fromEntries(
			Object.entries(collectionsValue).map(([configId, value]) => [
				configId,
				parseNavigationManifestCollection(value, `navigation manifest collections.${configId}`)
			])
		);
	}

	return manifest;
}

export function serializeNavigationManifest(manifest: NavigationManifest): string {
	return `${JSON.stringify(manifest, null, '\t')}\n`;
}

export async function loadNavigationManifestState(
	backend: RepositoryBackend,
	options?: RepositoryReadOptions
): Promise<NavigationManifestState> {
	const exists = await backend.fileExists(NAVIGATION_MANIFEST_PATH, options);

	if (!exists) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: false,
			manifest: null,
			error: null
		};
	}

	try {
		const content = await backend.readTextFile(NAVIGATION_MANIFEST_PATH, options);

		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: true,
			manifest: parseNavigationManifest(content),
			error: null
		};
	} catch (error) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: true,
			manifest: null,
			error: error instanceof Error ? error.message : 'Failed to parse navigation manifest'
		};
	}
}

function getSuggestedConfigIdBase(config: DiscoveredConfig): string {
	return config.slug;
}

function getUniqueConfigId(base: string, existingIds: Set<string>): string {
	if (!existingIds.has(base)) {
		existingIds.add(base);
		return base;
	}

	let suffix = 2;
	while (existingIds.has(`${base}-${suffix}`)) {
		suffix += 1;
	}

	const nextId = `${base}-${suffix}`;
	existingIds.add(nextId);
	return nextId;
}

export function getMissingContentConfigIds(configs: DiscoveredConfig[]): MissingContentConfigId[] {
	const existingIds = new Set(
		configs
			.map((config) => config.config.id)
			.filter((configId): configId is string => typeof configId === 'string' && configId.length > 0)
	);

	return configs.flatMap((config) => {
		if (config.config.id) {
			return [];
		}

		return [
			{
				path: config.path,
				slug: config.slug,
				label: config.config.label,
				suggestedId: getUniqueConfigId(getSuggestedConfigIdBase(config), existingIds)
			}
		];
	});
}

function withInsertedIdRecord(
	input: Record<string, unknown>,
	configId: string
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	let inserted = false;

	for (const [key, value] of Object.entries(input)) {
		output[key] = value;

		if (key === 'label' && !inserted) {
			output.id = configId;
			inserted = true;
		}
	}

	if (!inserted) {
		return {
			id: configId,
			...output
		};
	}

	return output;
}

export function addContentConfigIdToSource(source: string, configId: string): string {
	const parsed = JSON.parse(source) as unknown;
	assertObject(parsed, 'content config file must be an object');

	if (parsed.type !== 'content') {
		throw new Error('Only top-level content configs can receive a navigation id');
	}

	if (typeof parsed.id === 'string' && parsed.id.length > 0) {
		return `${JSON.stringify(parsed, null, '\t')}\n`;
	}

	return `${JSON.stringify(withInsertedIdRecord(parsed, configId), null, '\t')}\n`;
}

export async function writeMissingContentConfigIds(
	backend: RepositoryBackend,
	configs: DiscoveredConfig[],
	options?: RepositoryWriteOptions
): Promise<MissingContentConfigId[]> {
	const missingConfigs = getMissingContentConfigIds(configs);

	for (const config of missingConfigs) {
		const source = await backend.readTextFile(config.path, options);
		await backend.writeTextFile(
			config.path,
			addContentConfigIdToSource(source, config.suggestedId),
			options
		);
	}

	return missingConfigs;
}

function getCollectionManifestEntry(
	config: DiscoveredConfig,
	items: string[]
): [string, NavigationManifestCollection] | null {
	if (!config.config.collection || !config.config.id || !config.config.idField) {
		return null;
	}

	return [config.config.id, { items }];
}

function getCollectionItemIds(config: DiscoveredConfig, content: unknown): string[] {
	if (!Array.isArray(content)) {
		return [];
	}

	return content.flatMap((item) => {
		const itemId = getContentItemId(config.config, item as ContentRecord);
		return itemId ? [itemId] : [];
	});
}

export async function buildNavigationManifestFromRepository(
	backend: RepositoryBackend,
	configs: DiscoveredConfig[]
): Promise<NavigationManifest> {
	const manifest: NavigationManifest = {
		version: 1,
		content: {
			items: configs.flatMap((config) => (config.config.id ? [config.config.id] : []))
		}
	};

	const collectionEntries = await Promise.all(
		configs.map(async (config) => {
			if (!config.config.collection || !config.config.id || !config.config.idField) {
				return null;
			}

			const content = await fetchContentDocument(backend, config.config, config.path);
			return getCollectionManifestEntry(config, getCollectionItemIds(config, content));
		})
	);

	const collections = Object.fromEntries(
		collectionEntries.filter(
			(entry): entry is [string, NavigationManifestCollection] => entry !== null
		)
	);

	if (Object.keys(collections).length > 0) {
		manifest.collections = collections;
	}

	return manifest;
}

export async function writeNavigationManifest(
	backend: RepositoryBackend,
	manifest: NavigationManifest,
	options?: RepositoryWriteOptions
): Promise<void> {
	await backend.writeTextFile(
		NAVIGATION_MANIFEST_PATH,
		serializeNavigationManifest(manifest),
		options
	);
}

export function getManualNavigationSetupState(
	configs: DiscoveredConfig[],
	manifestState: NavigationManifestState
): ManualNavigationSetupState {
	const missingConfigIds = getMissingContentConfigIds(configs);
	const collections = configs
		.filter((config) => config.config.collection)
		.map((config) => ({
			slug: config.slug,
			label: config.config.label,
			configId: config.config.id ?? null,
			idField: config.config.idField ?? null,
			canOrderItems: !!config.config.id && !!config.config.idField
		}));

	const hasAnyConfigId = configs.some((config) => !!config.config.id);

	let status: ManualNavigationSetupState['status'] = 'inactive';

	if (manifestState.exists && manifestState.manifest && missingConfigIds.length === 0) {
		status = 'active';
	} else if (manifestState.exists || hasAnyConfigId || missingConfigIds.length < configs.length) {
		status = 'partial';
	}

	return {
		status,
		manifestPath: manifestState.path,
		manifestExists: manifestState.exists,
		manifestValid: manifestState.manifest !== null,
		manifestError: manifestState.error,
		missingConfigIds,
		collections
	};
}
