import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { OrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type {
	ContentDocument,
	ContentRecord
} from '$lib/features/content-management/types';
import type { RepoBootstrapIdentity } from '$lib/repository/config-bootstrap';
import type { LocalDiscoverySignature } from '$lib/repository/local';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	createWorkflowBlockSupportData,
	createWorkflowCollectionNavigationData,
	createWorkflowConfigStatesData,
	createWorkflowFreshnessData,
	createWorkflowItemViewData,
	createWorkflowPageViewData,
	createWorkflowRouteDataIdentity,
	createWorkflowWorkspaceBootstrapData,
	type WorkflowBlockSupportData,
	type WorkflowCollectionNavigationData,
	type WorkflowConfigStatesData,
	type WorkflowItemViewData,
	type WorkflowPageViewData,
	type WorkflowRouteDataIdentity,
	type WorkflowWorkspaceBootstrapData
} from '$lib/repository/workflow-data';

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

export function createLocalWorkflowIdentity(input: {
	backend: RepositoryBackend;
	discoverySignature: LocalDiscoverySignature | null;
}): WorkflowRouteDataIdentity | null {
	return createWorkflowRouteDataIdentity(
		createLocalRepositoryIdentity(input.backend, input.discoverySignature),
		{
			hasEditableDraft: false
		}
	);
}

export function createLocalWorkflowBlockSupportData(input: {
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistryError: string | null;
}): WorkflowBlockSupportData {
	return createWorkflowBlockSupportData({
		blockConfigs: input.blockConfigs,
		packageBlocks: [],
		blockRegistryError: input.blockRegistryError
	});
}

export function createLocalWorkflowWorkspaceBootstrapData(input: {
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
		blockSupport: createLocalWorkflowBlockSupportData({
			blockConfigs: input.blockConfigs,
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

export function createLocalWorkflowCollectionNavigationData(input: {
	backend: RepositoryBackend;
	discoverySignature: LocalDiscoverySignature | null;
	slug: string;
	navigation: OrderedCollectionNavigation;
}): WorkflowCollectionNavigationData {
	return createWorkflowCollectionNavigationData({
		identity: createLocalWorkflowIdentity(input),
		slug: input.slug,
		navigation: input.navigation
	});
}

export function createLocalWorkflowConfigStatesData(input: {
	backend: RepositoryBackend;
	discoverySignature: LocalDiscoverySignature | null;
	statesBySlug: Record<string, ResolvedContentState | null>;
	stateConfigCount: number;
}): WorkflowConfigStatesData {
	return createWorkflowConfigStatesData({
		identity: createLocalWorkflowIdentity(input),
		statesBySlug: input.statesBySlug,
		stateConfigCount: input.stateConfigCount
	});
}

export function createLocalWorkflowPageViewData(input: {
	backend: RepositoryBackend;
	discoverySignature: LocalDiscoverySignature | null;
	slug: string;
	discoveredConfig: DiscoveredConfig | null;
	content: ContentDocument | null;
	collectionNavigation: OrderedCollectionNavigation | null;
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistryError: string | null;
	contentError: string | null;
}): WorkflowPageViewData {
	return createWorkflowPageViewData({
		identity: createLocalWorkflowIdentity(input),
		slug: input.slug,
		discoveredConfig: input.discoveredConfig,
		content: input.content,
		collectionNavigation: input.collectionNavigation,
		blockSupport: createLocalWorkflowBlockSupportData({
			blockConfigs: input.blockConfigs,
			blockRegistryError: input.blockRegistryError
		}),
		contentError: input.contentError
	});
}

export function createLocalWorkflowItemViewData(input: {
	backend: RepositoryBackend;
	discoverySignature: LocalDiscoverySignature | null;
	slug: string;
	itemId: string;
	discoveredConfig: DiscoveredConfig | null;
	item: ContentRecord | null;
	navigationManifest: NavigationManifestState | null;
	blockConfigs: DiscoveredBlockConfig[];
	blockRegistryError: string | null;
	contentError: string | null;
}): WorkflowItemViewData {
	return createWorkflowItemViewData({
		identity: createLocalWorkflowIdentity(input),
		slug: input.slug,
		itemId: input.itemId,
		discoveredConfig: input.discoveredConfig,
		item: input.item,
		navigationManifest: input.navigationManifest,
		blockSupport: createLocalWorkflowBlockSupportData({
			blockConfigs: input.blockConfigs,
			blockRegistryError: input.blockRegistryError
		}),
		contentError: input.contentError
	});
}
