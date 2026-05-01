import {
	loadLocalBlockAdapter,
	type LoadedLocalBlockAdapter,
	type LoadLocalBlockAdapterModule
} from '$lib/blocks/adapter-files';
import { createStructuredBlockAdapter } from '$lib/blocks/adapters/structured';
import { BUILT_IN_BLOCKS, type BuiltInBlockDefinition } from '$lib/blocks/builtins';
import {
	loadBlockPackage,
	type LoadedPackageBlock,
	type LoadBlockPackageModule
} from '$lib/blocks/packages';
import type { BlockAdapter } from '$lib/blocks/adapters/types';
import type { DiscoveredBlockConfig } from '$lib/config/discovery';
import type { BlockUsage } from '$lib/config/types';
import { isTentmanGroupBlock } from '$lib/config/tentman-group';
import type { RepositoryBackend } from '$lib/repository/types';

export interface LocalBlockDefinition {
	id: string;
	kind: 'local';
	path: string;
	config: DiscoveredBlockConfig['config'];
	adapterPath?: string;
	adapter?: BlockAdapter;
}

export interface PackageBlockDefinition {
	id: string;
	kind: 'package';
	packageName: string;
	config: LoadedPackageBlock['config'];
	adapter?: BlockAdapter;
}

export type BlockRegistryEntry =
	| BuiltInBlockDefinition
	| LocalBlockDefinition
	| PackageBlockDefinition;

export interface BlockRegistry {
	entries: BlockRegistryEntry[];
	get(id: string): BlockRegistryEntry | undefined;
	has(id: string): boolean;
	getAdapter(id: string): BlockAdapter | undefined;
}

interface CreateBlockRegistryOptions {
	localAdapters?: Map<string, LoadedLocalBlockAdapter>;
	packageBlocks?: LoadedPackageBlock[];
}

export interface LoadBlockRegistryOptions {
	loadLocalAdapterModule?: LoadLocalBlockAdapterModule;
	loadBlockPackageModule?: LoadBlockPackageModule;
	blockPackages?: string[];
}

function getBlockSourceLabel(entry: BlockRegistryEntry): string {
	if (entry.kind === 'built_in') {
		return `built-in block "${entry.id}"`;
	}

	if (entry.kind === 'local') {
		return `block config at ${entry.path}`;
	}

	return `package block "${entry.id}" from package "${entry.packageName}"`;
}

function failOnDuplicateId(id: string, existing: BlockRegistryEntry, nextSource: string): never {
	const existingSource = getBlockSourceLabel(existing);

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

	if (isTentmanGroupBlock(usage)) {
		return registry.getAdapter('select');
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
	if (!entry || (entry.kind !== 'local' && entry.kind !== 'package')) {
		return null;
	}

	return {
		blocks: entry.config.blocks,
		collection:
			typeof usage.collection === 'boolean' ? usage.collection : entry.config.collection ?? false
	};
}

function createStructuredBlockAdapterForEntry(
	entry: LocalBlockDefinition | PackageBlockDefinition,
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

	return new Map(
		adapters.filter((entry): entry is readonly [string, LoadedLocalBlockAdapter] => !!entry)
	);
}

async function loadBlockPackages(
	packageNames: string[],
	loadModule: LoadBlockPackageModule
): Promise<LoadedPackageBlock[]> {
	const loadedPackages = await Promise.all(
		packageNames.map(async (packageName) => loadBlockPackage(packageName, loadModule))
	);

	return loadedPackages.flat();
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
			failOnDuplicateId(block.id, existing, `block config at ${block.path}`);
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

	const packageEntries: PackageBlockDefinition[] = [];

	for (const block of options.packageBlocks ?? []) {
		const existing = entriesById.get(block.config.id);

		if (existing) {
			failOnDuplicateId(
				block.config.id,
				existing,
				`package block "${block.config.id}" from package "${block.packageName}"`
			);
		}

		const entry: PackageBlockDefinition = {
			id: block.config.id,
			kind: 'package',
			packageName: block.packageName,
			config: block.config,
			adapter: block.adapter
		};

		packageEntries.push(entry);
		entriesById.set(block.config.id, entry);
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
			options.localAdapters?.get(entry.id)?.adapter ??
			createStructuredBlockAdapterForEntry(entry, registry);
	}

	for (const entry of packageEntries) {
		entry.adapter = entry.adapter ?? createStructuredBlockAdapterForEntry(entry, registry);
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
	const hasBlockPackages = (options.blockPackages?.length ?? 0) > 0;

	if (hasBlockPackages && !options.loadBlockPackageModule) {
		throw new Error(
			'Root config declares blockPackages, but no block package module loader is available'
		);
	}

	const packageBlocks =
		hasBlockPackages && options.loadBlockPackageModule
			? await loadBlockPackages(options.blockPackages!, options.loadBlockPackageModule)
			: undefined;

	return createBlockRegistry(localBlocks, { localAdapters, packageBlocks });
}

export async function loadBlockRegistry(
	backend: RepositoryBackend,
	options: LoadBlockRegistryOptions = {}
): Promise<BlockRegistry> {
	const [localBlocks, rootConfig] = await Promise.all([
		backend.discoverBlockConfigs(),
		backend.readRootConfig()
	]);

	return createLoadedBlockRegistry(localBlocks, {
		...options,
		loadLocalAdapterModule: backend.kind === 'local' ? options.loadLocalAdapterModule : undefined,
		blockPackages: rootConfig?.blockPackages
	});
}

export const DEFAULT_BLOCK_REGISTRY = createBlockRegistry([]);
