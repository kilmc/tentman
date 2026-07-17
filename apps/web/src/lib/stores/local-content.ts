import type { BlockRegistry } from '$lib/blocks/registry';
import { createLoadedBlockRegistry } from '$lib/blocks/registry';
import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import {
	loadNavigationManifestState,
	NAVIGATION_MANIFEST_PATH,
	type NavigationManifestState
} from '$lib/features/content-management/navigation-manifest';
import { clearContentComponentRegistryCache } from '$lib/content-components/browser';
import { localRepo } from '$lib/stores/local-repo';
import { shouldUseLocalConfigCache, type RootConfig } from '$lib/config/root-config';
import type { LocalDiscoverySignature } from '$lib/repository/local';
import type { RepositoryBackend } from '$lib/repository/types';
import type { RepoBootstrapIdentity } from '$lib/repository/config-bootstrap';
import {
	createWorkflowBlockSupportData,
	createWorkflowFreshnessData,
	createWorkflowWorkspaceBootstrapData,
	type WorkflowWorkspaceBootstrapData
} from '$lib/repository/workflow-data';

type LocalContentState = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	backendKey: string | null;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistry: BlockRegistry | null;
	blockRegistryError: string | null;
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	instructionDiscovery: InstructionDiscoveryResult;
	discoverySignature: LocalDiscoverySignature | null;
	workflowData: WorkflowWorkspaceBootstrapData | null;
	error: string | null;
};

type PersistedLocalContentState = {
	version: 1;
	backendKey: string;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	instructionDiscovery: InstructionDiscoveryResult;
	discoverySignature?: LocalDiscoverySignature | null;
};

const LOCAL_CONTENT_CACHE_PREFIX = 'tentman:local-content:';

function getPersistedStateKey(backendKey: string) {
	return `${LOCAL_CONTENT_CACHE_PREFIX}${backendKey}`;
}

function readPersistedState(backendKey: string): PersistedLocalContentState | null {
	if (!browser) {
		return null;
	}

	try {
		const raw = localStorage.getItem(getPersistedStateKey(backendKey));
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw) as PersistedLocalContentState;
		if (parsed.version !== 1 || parsed.backendKey !== backendKey) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function writePersistedState(state: PersistedLocalContentState) {
	if (!browser) {
		return;
	}

	try {
		localStorage.setItem(getPersistedStateKey(state.backendKey), JSON.stringify(state));
	} catch {
		// Ignore storage quota and serialization failures; the live state still works.
	}
}

function clearPersistedState(backendKey: string) {
	if (!browser) {
		return;
	}

	try {
		localStorage.removeItem(getPersistedStateKey(backendKey));
	} catch {
		// Ignore storage failures.
	}
}

function areDiscoverySignaturesEqual(
	left: LocalDiscoverySignature | null | undefined,
	right: LocalDiscoverySignature | null | undefined
): boolean {
	return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function getDiscoverySignatureDataSetKey(signature: LocalDiscoverySignature | null): string {
	if (!signature) {
		return 'local-empty';
	}

	let hash = 0x811c9dc5;
	const value = JSON.stringify(signature);
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return `local:${(hash >>> 0).toString(36)}`;
}

function createLocalRepositoryIdentity(
	backend: RepositoryBackend,
	discoverySignature: LocalDiscoverySignature | null
): RepoBootstrapIdentity {
	const dataSetKey = getDiscoverySignatureDataSetKey(discoverySignature);

	return {
		mode: 'local',
		repoKey: backend.cacheKey,
		label: backend.label,
		ref: dataSetKey,
		headSha: dataSetKey,
		treeSha: dataSetKey,
		resolvedAt: Date.now()
	};
}

function createLocalWorkflowData(input: {
	backend: RepositoryBackend;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistryError: string | null;
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	discoverySignature: LocalDiscoverySignature | null;
}): WorkflowWorkspaceBootstrapData {
	const repositoryIdentity = createLocalRepositoryIdentity(
		input.backend,
		input.discoverySignature
	);
	const workflowData = createWorkflowWorkspaceBootstrapData({
		configs: input.configs,
		blockConfigs: input.blockConfigs,
		rootConfig: input.rootConfig,
		navigationManifest: input.navigationManifest,
		singletonContentIdentities: {},
		activeDraftBranch: null,
		repositoryIdentity,
		mainRepositoryIdentity: repositoryIdentity,
		draftRepositoryIdentity: null,
		changedPaths: [],
		freshnessStatus: 'unchanged'
	});

	return {
		...workflowData,
		blockSupport: createWorkflowBlockSupportData({
			blockConfigs: input.blockConfigs,
			packageBlocks: [],
			blockRegistryError: input.blockRegistryError
		}),
		freshness: createWorkflowFreshnessData({
			activeDraftBranch: null,
			repositoryIdentity,
			mainRepositoryIdentity: repositoryIdentity,
			draftRepositoryIdentity: null,
			unchanged: true,
			freshnessStatus: 'unchanged',
			changedPaths: [],
			error: null,
			recovery: null
		})
	};
}

async function loadBlockRegistry(
	blockConfigs: DiscoveredBlockConfig[],
	rootConfig: RootConfig | null
): Promise<{ blockRegistry: BlockRegistry | null; blockRegistryError: string | null }> {
	if ((rootConfig?.blockPackages?.length ?? 0) > 0) {
		return {
			blockRegistry: null,
			blockRegistryError:
				'Package-distributed blocks are not supported in local browser-backed mode yet. Remove root.blockPackages or switch to the GitHub-backed/server mode for now.'
		};
	}

	try {
		return {
			blockRegistry: await createLoadedBlockRegistry(blockConfigs),
			blockRegistryError: null
		};
	} catch (error) {
		return {
			blockRegistry: null,
			blockRegistryError:
				error instanceof Error ? error.message : 'Failed to load local reusable blocks'
		};
	}
}

async function loadOptionalNavigationManifestState(
	backend: RepositoryBackend
): Promise<NavigationManifestState> {
	try {
		return await loadNavigationManifestState(backend);
	} catch (error) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: false,
			manifest: null,
			error:
				error instanceof Error ? error.message : 'Failed to load local navigation manifest'
		};
	}
}

function createStore() {
	const store = writable<LocalContentState>({
		status: 'idle',
		backendKey: null,
		configs: [],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		},
		discoverySignature: null,
		workflowData: null,
		error: null
	});
	const { subscribe, set, update } = store;
	let inFlightRefresh: Promise<void> | null = null;

	return {
		subscribe,

		async refresh(options: { force?: boolean } = {}) {
			let repoState = get(localRepo);
			if (!repoState.backend) {
				await localRepo.hydrate();
				repoState = get(localRepo);
			}

			if (!repoState.backend) {
				set({
					status: 'error',
					backendKey: null,
					configs: [],
					blockConfigs: [],
					blockRegistry: null,
					blockRegistryError: null,
					rootConfig: null,
					navigationManifest: {
						path: 'tentman/navigation-manifest.json',
						exists: false,
						manifest: null,
						error: null
					},
					instructionDiscovery: {
						instructions: [],
						issues: []
					},
					discoverySignature: null,
					workflowData: null,
					error: 'No local repository is open.'
				});
				return;
			}

			const backend = repoState.backend;
			const discoverySignature = await backend.getDiscoverySignature();
			const rootConfig = await backend.readRootConfig();
			const shouldUsePersistedCache = shouldUseLocalConfigCache(rootConfig);
			const currentState = get(store);
			if (
				!options.force &&
				currentState.status === 'ready' &&
				currentState.backendKey === backend.cacheKey &&
				areDiscoverySignaturesEqual(currentState.discoverySignature, discoverySignature)
			) {
				return;
			}

			if (
				!options.force &&
				currentState.status === 'ready' &&
				currentState.backendKey === backend.cacheKey &&
				!areDiscoverySignaturesEqual(currentState.discoverySignature, discoverySignature)
			) {
				backend.invalidateDiscoveryCache();
				clearContentComponentRegistryCache();
				clearPersistedState(backend.cacheKey);
			}

			if (
				!options.force &&
				currentState.status === 'loading' &&
				currentState.backendKey === backend.cacheKey &&
				inFlightRefresh
			) {
				await inFlightRefresh;
				return;
			}

			if (options.force) {
				backend.invalidateDiscoveryCache();
				clearContentComponentRegistryCache();
				clearPersistedState(backend.cacheKey);
			}

			if (!shouldUsePersistedCache) {
				clearPersistedState(backend.cacheKey);
			}

			const shouldClearForRepoChange =
				currentState.backendKey !== null && currentState.backendKey !== backend.cacheKey;

			if (shouldClearForRepoChange) {
				clearContentComponentRegistryCache();
			}

			update((state) => ({
				...state,
				status: 'loading',
				backendKey: shouldClearForRepoChange ? backend.cacheKey : state.backendKey,
				configs: shouldClearForRepoChange ? [] : state.configs,
				blockConfigs: shouldClearForRepoChange ? [] : state.blockConfigs,
				blockRegistry: shouldClearForRepoChange ? null : state.blockRegistry,
				blockRegistryError: shouldClearForRepoChange ? null : state.blockRegistryError,
				rootConfig: shouldClearForRepoChange ? null : state.rootConfig,
				navigationManifest: shouldClearForRepoChange
					? {
							path: 'tentman/navigation-manifest.json',
							exists: false,
							manifest: null,
							error: null
						}
					: state.navigationManifest,
				instructionDiscovery: shouldClearForRepoChange
					? {
							instructions: [],
							issues: []
						}
					: state.instructionDiscovery,
				discoverySignature: shouldClearForRepoChange ? null : state.discoverySignature,
				workflowData: shouldClearForRepoChange ? null : state.workflowData,
				error: null
			}));

			if (!options.force && shouldUsePersistedCache) {
				const persistedState = readPersistedState(backend.cacheKey);
				if (
					persistedState &&
					areDiscoverySignaturesEqual(persistedState.discoverySignature, discoverySignature)
				) {
					const { blockRegistry, blockRegistryError } = await loadBlockRegistry(
						persistedState.blockConfigs,
						persistedState.rootConfig
					);

					set({
						status: 'ready',
						backendKey: persistedState.backendKey,
						configs: persistedState.configs,
						blockConfigs: persistedState.blockConfigs,
						blockRegistry,
						blockRegistryError,
						rootConfig: persistedState.rootConfig,
						navigationManifest: persistedState.navigationManifest,
						instructionDiscovery: persistedState.instructionDiscovery,
						discoverySignature: persistedState.discoverySignature ?? null,
						workflowData: createLocalWorkflowData({
							backend,
							configs: persistedState.configs,
							blockConfigs: persistedState.blockConfigs,
							blockRegistryError,
							rootConfig: persistedState.rootConfig,
							navigationManifest: persistedState.navigationManifest,
							discoverySignature: persistedState.discoverySignature ?? null
						}),
						error: null
					});
					return;
				}

				if (persistedState) {
					backend.invalidateDiscoveryCache();
					clearContentComponentRegistryCache();
					clearPersistedState(backend.cacheKey);
				}
			}

			inFlightRefresh = (async () => {
				try {
					const [configs, blockConfigs, navigationManifest, instructionDiscovery] =
						await Promise.all([
							backend.discoverConfigs(),
							backend.discoverBlockConfigs(),
							loadOptionalNavigationManifestState(backend),
							discoverInstructions(backend)
						]);

					const { blockRegistry, blockRegistryError } = await loadBlockRegistry(
						blockConfigs,
						rootConfig
					);
					const workflowData = createLocalWorkflowData({
						backend,
						configs,
						blockConfigs,
						blockRegistryError,
						rootConfig,
						navigationManifest,
						discoverySignature
					});

					if (shouldUsePersistedCache) {
						writePersistedState({
							version: 1,
							backendKey: backend.cacheKey,
							configs,
							blockConfigs,
							rootConfig,
							navigationManifest,
							instructionDiscovery,
							discoverySignature
						});
					}

					set({
						status: 'ready',
						backendKey: backend.cacheKey,
						configs,
						blockConfigs,
						blockRegistry,
						blockRegistryError,
						rootConfig,
						navigationManifest,
						instructionDiscovery,
						discoverySignature,
						workflowData,
						error: null
					});
				} catch (error) {
					set({
						status: 'error',
						backendKey: backend.cacheKey,
						configs: [],
						blockConfigs: [],
						blockRegistry: null,
						blockRegistryError: null,
						rootConfig: null,
						navigationManifest: {
							path: 'tentman/navigation-manifest.json',
							exists: false,
							manifest: null,
							error: null
						},
						instructionDiscovery: {
							instructions: [],
							issues: []
						},
						discoverySignature: null,
						workflowData: null,
						error:
							error instanceof Error ? error.message : 'Failed to load local repository content'
					});
				} finally {
					inFlightRefresh = null;
				}
			})();

			await inFlightRefresh;
		},

		reset() {
			inFlightRefresh = null;
			set({
				status: 'idle',
				backendKey: null,
				configs: [],
				blockConfigs: [],
				blockRegistry: null,
				blockRegistryError: null,
				rootConfig: null,
				navigationManifest: {
					path: 'tentman/navigation-manifest.json',
					exists: false,
					manifest: null,
					error: null
				},
				instructionDiscovery: {
					instructions: [],
					issues: []
				},
				discoverySignature: null,
				workflowData: null,
				error: null
			});
		}
	};
}

export const localContent = createStore();
