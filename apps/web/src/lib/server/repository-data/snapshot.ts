import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { RepositoryBackend } from '$lib/repository/types';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { logTiming } from '$lib/utils/performance-logging';
import { discoverGitHubSnapshotConfigs } from './discovery';
import { canUseGitHubSource, getRepositoryRefIdentity, getRepositoryTree } from './source';
import type {
	BlockConfigIndex,
	ConfigIndex,
	RepositorySnapshot,
	RepositorySnapshotInput,
	RepositoryTree
} from './types';

const snapshotCache = new Map<string, RepositorySnapshot>();
const snapshotInflight = new Map<string, Promise<RepositorySnapshot>>();

function createConfigIndex(configs: RepositorySnapshot['configIndex']['configs']): ConfigIndex {
	return {
		configs,
		bySlug: new Map(configs.map((config) => [config.slug, config])),
		byConfigPath: new Map(configs.map((config) => [config.path, config]))
	};
}

function createBlockConfigIndex(
	configs: RepositorySnapshot['blockConfigIndex']['configs']
): BlockConfigIndex {
	return {
		configs,
		byId: new Map(configs.map((config) => [config.id, config])),
		byConfigPath: new Map(configs.map((config) => [config.path, config]))
	};
}

function getSnapshotCacheKey(snapshot: Pick<RepositorySnapshot, 'identity'>): string {
	const { repoKey, ref, headSha, treeSha } = snapshot.identity;
	return `snapshot:${repoKey}:${ref}:${headSha}:${treeSha}`;
}

function getIdentityInflightKey(backend: RepositoryBackend, ref?: string | null): string {
	return `snapshot:${backend.cacheKey}:${ref ?? '<default>'}`;
}

interface SnapshotDiscoveryData {
	configs: RepositorySnapshot['configIndex']['configs'];
	blockConfigs: RepositorySnapshot['blockConfigIndex']['configs'];
	rootConfig: RepositorySnapshot['rootConfig'];
	tree?: RepositoryTree;
}

async function loadSnapshotDiscoveryData(
	input: RepositorySnapshotInput,
	identity: RepositorySnapshot['identity']
): Promise<SnapshotDiscoveryData> {
	if (canUseGitHubSource(input.backend)) {
		const tree = await getRepositoryTree(input.backend, identity);
		const discovery = await discoverGitHubSnapshotConfigs(input.backend, tree);

		return {
			tree,
			...discovery
		};
	}

	const [configs, blockConfigs, rootConfig] = await Promise.all([
		getCachedConfigs(input.backend),
		input.backend.discoverBlockConfigs(),
		input.backend.readRootConfig()
	]);

	return {
		configs,
		blockConfigs,
		rootConfig
	};
}

async function loadSnapshot(input: RepositorySnapshotInput): Promise<RepositorySnapshot> {
	const identity = await getRepositoryRefIdentity(input.backend, input.ref);
	const cacheKey = getSnapshotCacheKey({ identity });
	const cached = snapshotCache.get(cacheKey);
	if (cached) {
		logTiming('repository-data.snapshot.cache-hit', {
			repoKey: identity.repoKey,
			ref: identity.ref,
			headSha: identity.headSha,
			treeSha: identity.treeSha
		});
		return cached;
	}

	const start = performance.now();
	const discovery = await loadSnapshotDiscoveryData(input, identity);
	const navigationManifest = await loadNavigationManifestState(
		input.backend,
		input.ref ? { ref: input.ref } : undefined
	);
	const snapshot: RepositorySnapshot = {
		identity,
		rootConfig: discovery.rootConfig,
		configIndex: createConfigIndex(discovery.configs),
		blockConfigIndex: createBlockConfigIndex(discovery.blockConfigs),
		navigationManifest,
		...(discovery.tree ? { tree: discovery.tree } : {}),
		loadedAt: Date.now()
	};

	snapshotCache.set(cacheKey, snapshot);
	logTiming('repository-data.snapshot.load', {
		repoKey: identity.repoKey,
		ref: identity.ref,
		headSha: identity.headSha,
		treeSha: identity.treeSha,
		configCount: discovery.configs.length,
		blockConfigCount: discovery.blockConfigs.length,
		durationMs: performance.now() - start
	});
	return snapshot;
}

export async function getRepositorySnapshot(
	input: RepositorySnapshotInput
): Promise<RepositorySnapshot> {
	const inflightKey = getIdentityInflightKey(input.backend, input.ref);
	const pending = snapshotInflight.get(inflightKey);
	if (pending) {
		return pending;
	}

	const promise = loadSnapshot(input).finally(() => {
		snapshotInflight.delete(inflightKey);
	});
	snapshotInflight.set(inflightKey, promise);
	return promise;
}

export function clearRepositorySnapshotCache(): void {
	snapshotCache.clear();
	snapshotInflight.clear();
}

export function clearRepositorySnapshotCacheForScope(input: {
	repoKey: string;
	ref?: string | null;
}): void {
	for (const key of snapshotCache.keys()) {
		if (!key.includes(`:${input.repoKey}:`)) {
			continue;
		}

		if (input.ref && !key.includes(`:${input.ref}:`)) {
			continue;
		}

		snapshotCache.delete(key);
	}

	for (const key of snapshotInflight.keys()) {
		if (!key.includes(`:${input.repoKey}:`)) {
			continue;
		}

		if (input.ref && !key.includes(`:${input.ref}`)) {
			continue;
		}

		snapshotInflight.delete(key);
	}
}
