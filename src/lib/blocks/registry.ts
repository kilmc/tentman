import {
	loadLocalBlockAdapter,
	type LoadedLocalBlockAdapter,
	type LoadLocalBlockAdapterModule
} from '$lib/blocks/adapter-files';
import { createStructuredBlockAdapter } from '$lib/blocks/adapters/structured';
import { BUILT_IN_BLOCKS, type BuiltInBlockDefinition } from '$lib/blocks/builtins';
import type { BlockAdapter } from '$lib/blocks/adapters/types';
import type { DiscoveredBlockConfig } from '$lib/config/discovery';
import type { BlockUsage } from '$lib/config/types';
import type { RepositoryBackend } from '$lib/repository/types';

export interface LocalBlockDefinition {
	id: string;
	kind: 'local';
	path: string;
	config: DiscoveredBlockConfig['config'];
	adapterPath?: string;
	adapter?: BlockAdapter;
}

export type BlockRegistryEntry = BuiltInBlockDefinition | LocalBlockDefinition;

export interface BlockRegistry {
	entries: BlockRegistryEntry[];
	get(id: string): BlockRegistryEntry | undefined;
	has(id: string): boolean;
	getAdapter(id: string): BlockAdapter | undefined;
}

interface CreateBlockRegistryOptions {
	localAdapters?: Map<string, LoadedLocalBlockAdapter>;
}

export interface LoadBlockRegistryOptions {
	loadLocalAdapterModule?: LoadLocalBlockAdapterModule;
}

function failOnDuplicateId(id: string, existing: BlockRegistryEntry, nextPath?: string): never {
	const existingSource =
		existing.kind === 'built_in' ? `built-in block "${existing.id}"` : `block config at ${existing.path}`;
	const nextSource = nextPath ? `block config at ${nextPath}` : `block "${id}"`;

	throw new Error(`Duplicate block id "${id}" between ${existingSource} and ${nextSource}`);
}

export function resolveBlockAdapterForUsage(
	usage: BlockUsage,
	registry: Pick<BlockRegistry, 'getAdapter'>
): BlockAdapter | undefined {
	if (usage.type === 'block' && usage.blocks) {
		return createStructuredBlockAdapter({
			type: usage.type,
			blocks: usage.blocks,
			defaultCollection: usage.collection,
			resolveAdapter: (childUsage) => resolveBlockAdapterForUsage(childUsage, registry)
		});
	}

	return registry.getAdapter(usage.type);
}

export function getStructuredBlocksForUsage(
	usage: BlockUsage,
	registry: Pick<BlockRegistry, 'get'>
): { blocks: BlockUsage[]; collection: boolean } | null {
	if (usage.type === 'block' && usage.blocks) {
		return {
			blocks: usage.blocks,
			collection: usage.collection ?? false
		};
	}

	const entry = registry.get(usage.type);
	if (entry?.kind !== 'local') {
		return null;
	}

	return {
		blocks: entry.config.blocks,
		collection: usage.collection ?? entry.config.collection ?? false
	};
}

function createStructuredLocalBlockAdapter(
	entry: LocalBlockDefinition,
	registry: BlockRegistry
): BlockAdapter {
	return createStructuredBlockAdapter({
		type: entry.id,
		blocks: entry.config.blocks,
		defaultCollection: entry.config.collection,
		resolveAdapter: (usage) => resolveBlockAdapterForUsage(usage, registry)
	});
}

async function loadLocalBlockAdapters(
	localBlocks: DiscoveredBlockConfig[],
	loadModule: LoadLocalBlockAdapterModule
): Promise<Map<string, LoadedLocalBlockAdapter>> {
	const adapters = await Promise.all(
		localBlocks.map(async (block) => {
			const loadedAdapter = await loadLocalBlockAdapter(block, loadModule);
			return loadedAdapter ? ([block.id, loadedAdapter] as const) : null;
		})
	);

	return new Map(adapters.filter((entry): entry is readonly [string, LoadedLocalBlockAdapter] => !!entry));
}

export function createBlockRegistry(
	localBlocks: DiscoveredBlockConfig[],
	options: CreateBlockRegistryOptions = {}
): BlockRegistry {
	const entriesById = new Map<string, BlockRegistryEntry>();

	for (const block of BUILT_IN_BLOCKS) {
		entriesById.set(block.id, block);
	}

	const localEntries: LocalBlockDefinition[] = [];

	for (const block of localBlocks) {
		const existing = entriesById.get(block.id);

		if (existing) {
			failOnDuplicateId(block.id, existing, block.path);
		}

		const entry: LocalBlockDefinition = {
			id: block.id,
			kind: 'local',
			path: block.path,
			config: block.config,
			adapterPath: options.localAdapters?.get(block.id)?.path
		};

		localEntries.push(entry);
		entriesById.set(block.id, entry);
	}

	const entries = Array.from(entriesById.values());

	const registry: BlockRegistry = {
		entries,
		get(id: string) {
			return entriesById.get(id);
		},
		has(id: string) {
			return entriesById.has(id);
		},
		getAdapter(id: string) {
			const entry = entriesById.get(id);
			return entry?.adapter;
		}
	};

	for (const entry of localEntries) {
		entry.adapter =
			options.localAdapters?.get(entry.id)?.adapter ?? createStructuredLocalBlockAdapter(entry, registry);
	}

	return registry;
}

export async function createLoadedBlockRegistry(
	localBlocks: DiscoveredBlockConfig[],
	options: LoadBlockRegistryOptions = {}
): Promise<BlockRegistry> {
	const localAdapters = options.loadLocalAdapterModule
		? await loadLocalBlockAdapters(localBlocks, options.loadLocalAdapterModule)
		: undefined;

	return createBlockRegistry(localBlocks, { localAdapters });
}

export async function loadBlockRegistry(
	backend: RepositoryBackend,
	options: LoadBlockRegistryOptions = {}
): Promise<BlockRegistry> {
	const localBlocks = await backend.discoverBlockConfigs();

	if (backend.kind !== 'local' || !options.loadLocalAdapterModule) {
		return createBlockRegistry(localBlocks);
	}

	return createLoadedBlockRegistry(localBlocks, options);
}

export const DEFAULT_BLOCK_REGISTRY = createBlockRegistry([]);
