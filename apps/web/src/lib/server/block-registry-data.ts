import type { DiscoveredBlockConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import {
	loadBlockPackage,
	type LoadBlockPackageModule,
	type LoadedPackageBlock,
	type SerializablePackageBlock
} from '$lib/blocks/packages';
import type { GitHubRepositoryBackend } from '$lib/repository/github';

export interface GitHubBlockRegistryData {
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
}

export async function loadInstalledBlockPackageModule(packageName: string): Promise<unknown> {
	try {
		return await import(/* @vite-ignore */ packageName);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown package import error';
		throw new Error(
			`Failed to import block package "${packageName}". Install it in the Tentman app runtime used for GitHub-backed/server mode before using root.blockPackages: ${message}`
		);
	}
}

function toSerializablePackageBlock(block: LoadedPackageBlock): SerializablePackageBlock {
	if (block.adapter) {
		throw new Error(
			`Package block "${block.config.id}" from package "${block.packageName}" uses a direct adapter export. The current GitHub-backed/server package path only supports structured package blocks for now.`
		);
	}

	return {
		packageName: block.packageName,
		config: block.config
	};
}

async function loadSerializablePackageBlocks(
	rootConfig: RootConfig | null,
	loadModule: LoadBlockPackageModule
): Promise<SerializablePackageBlock[]> {
	const packageNames = rootConfig?.blockPackages ?? [];

	if (packageNames.length === 0) {
		return [];
	}

	const loadedPackages = await Promise.all(
		packageNames.map((packageName) => loadBlockPackage(packageName, loadModule))
	);

	return loadedPackages.flat().map(toSerializablePackageBlock);
}

export async function loadGitHubBlockRegistryData(
	backend: GitHubRepositoryBackend,
	options: {
		loadBlockPackageModule?: LoadBlockPackageModule;
	} = {}
): Promise<GitHubBlockRegistryData> {
	const [blockConfigs, rootConfig] = await Promise.all([
		backend.discoverBlockConfigs(),
		backend.readRootConfig()
	]);

	try {
		return {
			blockConfigs,
			packageBlocks: await loadSerializablePackageBlocks(
				rootConfig,
				options.loadBlockPackageModule ?? loadInstalledBlockPackageModule
			),
			blockRegistryError: null
		};
	} catch (error) {
		return {
			blockConfigs,
			packageBlocks: [],
			blockRegistryError:
				error instanceof Error ? error.message : 'Failed to load package-distributed blocks'
		};
	}
}
