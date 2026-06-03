import {
	getDiscoverableBlockConfigPaths,
	getDiscoverableContentConfigPaths,
	parseDiscoveredBlockConfig,
	parseDiscoveredConfig,
	type DiscoveredBlockConfig,
	type DiscoveredConfig
} from '$lib/config/discovery';
import { parseRootConfig, type RootConfig } from '$lib/config/root-config';
import { normalizeRuntimeDiscoveredConfigIdentity } from '$lib/features/content-management/stable-identity';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import { logTiming } from '$lib/utils/performance-logging';
import { readGitHubTextBlob } from './source';
import type { RepositoryTree } from './types';

export interface SnapshotDiscoveryResult {
	rootConfig: RootConfig | null;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
}

function getBlobEntryByPath(tree: RepositoryTree): Map<string, RepositoryTree['entries'][number]> {
	return new Map(
		tree.entries
			.filter((entry) => entry.type === 'blob')
			.map((entry) => [entry.path, entry])
	);
}

async function readTextByPath(
	backend: GitHubRepositoryBackend,
	entriesByPath: Map<string, RepositoryTree['entries'][number]>,
	path: string
): Promise<string | null> {
	const entry = entriesByPath.get(path);
	if (!entry) {
		return null;
	}

	return readGitHubTextBlob(backend, entry.sha);
}

async function readRootConfigFromTree(
	backend: GitHubRepositoryBackend,
	entriesByPath: Map<string, RepositoryTree['entries'][number]>
): Promise<RootConfig | null> {
	const source = await readTextByPath(backend, entriesByPath, 'tentman.json');
	if (!source) {
		return null;
	}

	try {
		return parseRootConfig(source);
	} catch {
		return null;
	}
}

async function discoverContentConfigsFromTree(
	backend: GitHubRepositoryBackend,
	entriesByPath: Map<string, RepositoryTree['entries'][number]>,
	paths: string[],
	rootConfig: RootConfig | null
): Promise<DiscoveredConfig[]> {
	const configs = await Promise.all(
		paths.map(async (path) => {
			try {
				const source = await readTextByPath(backend, entriesByPath, path);
				return source ? parseDiscoveredConfig(path, source) : null;
			} catch (err) {
				console.error(`Failed to fetch/parse config at ${path}:`, err);
				return null;
			}
		})
	);

	return normalizeRuntimeDiscoveredConfigIdentity(
		configs.filter((config): config is DiscoveredConfig => config !== null),
		rootConfig
	);
}

async function discoverBlockConfigsFromTree(
	backend: GitHubRepositoryBackend,
	entriesByPath: Map<string, RepositoryTree['entries'][number]>,
	paths: string[]
): Promise<DiscoveredBlockConfig[]> {
	const configs = await Promise.all(
		paths.map(async (path) => {
			try {
				const source = await readTextByPath(backend, entriesByPath, path);
				return source ? parseDiscoveredBlockConfig(path, source) : null;
			} catch (err) {
				console.error(`Failed to fetch/parse block config at ${path}:`, err);
				return null;
			}
		})
	);

	return configs.filter((config): config is DiscoveredBlockConfig => config !== null);
}

export async function discoverGitHubSnapshotConfigs(
	backend: GitHubRepositoryBackend,
	tree: RepositoryTree
): Promise<SnapshotDiscoveryResult> {
	const start = performance.now();
	const entriesByPath = getBlobEntryByPath(tree);
	const rootConfig = await readRootConfigFromTree(backend, entriesByPath);
	const blobPaths = [...entriesByPath.keys()];
	const configPaths = getDiscoverableContentConfigPaths(blobPaths, rootConfig);
	const blockConfigPaths = getDiscoverableBlockConfigPaths(blobPaths, rootConfig);

	const [configs, blockConfigs] = await Promise.all([
		discoverContentConfigsFromTree(backend, entriesByPath, configPaths, rootConfig),
		discoverBlockConfigsFromTree(backend, entriesByPath, blockConfigPaths)
	]);

	logTiming('repository-data.snapshot.discovery', {
		repoKey: tree.identity.repoKey,
		ref: tree.identity.ref,
		treeSha: tree.identity.treeSha,
		treeEntryCount: tree.entries.length,
		configPathCount: configPaths.length,
		blockConfigPathCount: blockConfigPaths.length,
		discoveredConfigCount: configs.length,
		discoveredBlockConfigCount: blockConfigs.length,
		durationMs: performance.now() - start
	});

	return {
		rootConfig,
		configs,
		blockConfigs
	};
}

