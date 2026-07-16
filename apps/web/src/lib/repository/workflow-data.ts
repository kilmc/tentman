import type { SerializablePackageBlock } from '$lib/blocks/packages';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { OrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type {
	ContentDocument,
	ContentRecord
} from '$lib/features/content-management/types';
import type {
	RepoBootstrapIdentity,
	RepoConfigsBootstrap,
	RepoFreshnessIdentityResult
} from '$lib/repository/config-bootstrap';

export type WorkflowDataMode = 'github' | 'local';
export type WorkflowDataReadiness = 'ready' | 'missing' | 'stale' | 'error';
export type WorkflowCacheMissTarget =
	| 'workspace-bootstrap'
	| 'collection-navigation'
	| 'page-view'
	| 'item-view'
	| 'config-states'
	| 'block-support'
	| 'freshness';
export type WorkflowCacheMissRecovery = 'fetch-route-data' | 'refresh-workspace' | 'keep-current-data';
export type WorkflowFreshnessStatus = 'unchanged' | 'changed' | 'stale' | 'error' | 'unknown';

export interface WorkflowRouteDataIdentity {
	mode: WorkflowDataMode;
	workspaceKey: string;
	workspaceLabel: string;
	dataSetKey: string;
	resolvedAt: number | null;
	hasEditableDraft: boolean;
}

export interface WorkflowBlockSupportData {
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	error: string | null;
}

export interface WorkflowWorkspaceBootstrapData {
	identity: WorkflowRouteDataIdentity | null;
	rootConfig: RootConfig | null;
	configs: DiscoveredConfig[];
	navigationManifest: NavigationManifestState;
	blockSupport: WorkflowBlockSupportData;
	changedContentPaths: string[];
}

export interface WorkflowCollectionNavigationData {
	identity: WorkflowRouteDataIdentity | null;
	slug: string;
	navigation: OrderedCollectionNavigation;
	readiness: WorkflowDataReadiness;
	cacheMiss: WorkflowCacheMissResult | null;
}

export interface WorkflowPageViewData {
	identity: WorkflowRouteDataIdentity | null;
	slug: string;
	discoveredConfig: DiscoveredConfig | null;
	content: ContentDocument | null;
	collectionNavigation: OrderedCollectionNavigation | null;
	blockSupport: WorkflowBlockSupportData;
	contentError: string | null;
	readiness: WorkflowDataReadiness;
	cacheMiss: WorkflowCacheMissResult | null;
}

export interface WorkflowItemViewData {
	identity: WorkflowRouteDataIdentity | null;
	slug: string;
	itemId: string;
	discoveredConfig: DiscoveredConfig | null;
	item: ContentRecord | null;
	navigationManifest: NavigationManifestState | null;
	blockSupport: WorkflowBlockSupportData;
	contentError: string | null;
	readiness: WorkflowDataReadiness;
	cacheMiss: WorkflowCacheMissResult | null;
}

export interface WorkflowConfigStatesData {
	identity: WorkflowRouteDataIdentity | null;
	statesBySlug: Record<string, ResolvedContentState>;
	stateConfigCount: number;
	readiness: WorkflowDataReadiness;
	cacheMiss: WorkflowCacheMissResult | null;
}

export interface WorkflowFreshnessData {
	identity: WorkflowRouteDataIdentity | null;
	status: WorkflowFreshnessStatus;
	unchanged: boolean;
	changedContentPaths: string[];
	error: string | null;
	recovery: string | null;
}

export interface WorkflowCacheMissResult {
	target: WorkflowCacheMissTarget;
	slug: string | null;
	itemId: string | null;
	readiness: Exclude<WorkflowDataReadiness, 'ready'>;
	reason: string;
	recovery: WorkflowCacheMissRecovery;
}

function getDataSetKey(identity: RepoBootstrapIdentity): string {
	const value = [
		identity.mode,
		identity.repoKey,
		identity.ref,
		identity.headSha,
		identity.treeSha
	].join('\u001f');
	let hash = 0x811c9dc5;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return `dataset:${(hash >>> 0).toString(36)}`;
}

export function createWorkflowRouteDataIdentity(
	identity: RepoBootstrapIdentity | null | undefined,
	options: {
		hasEditableDraft?: boolean;
	} = {}
): WorkflowRouteDataIdentity | null {
	if (!identity) {
		return null;
	}

	return {
		mode: identity.mode === 'local' ? 'local' : 'github',
		workspaceKey: identity.repoKey,
		workspaceLabel: identity.label,
		dataSetKey: getDataSetKey(identity),
		resolvedAt: identity.resolvedAt ?? null,
		hasEditableDraft: options.hasEditableDraft ?? false
	};
}

export function createWorkflowCacheMissResult(input: {
	target: WorkflowCacheMissTarget;
	slug?: string | null;
	itemId?: string | null;
	readiness?: Exclude<WorkflowDataReadiness, 'ready'>;
	reason: string;
	recovery?: WorkflowCacheMissRecovery;
}): WorkflowCacheMissResult {
	return {
		target: input.target,
		slug: input.slug ?? null,
		itemId: input.itemId ?? null,
		readiness: input.readiness ?? 'missing',
		reason: input.reason,
		recovery: input.recovery ?? 'fetch-route-data'
	};
}

export function createWorkflowBlockSupportData(input: {
	blockConfigs?: DiscoveredBlockConfig[] | null;
	packageBlocks?: SerializablePackageBlock[] | null;
	blockRegistryError?: string | null;
}): WorkflowBlockSupportData {
	return {
		blockConfigs: input.blockConfigs ?? [],
		packageBlocks: input.packageBlocks ?? [],
		error: input.blockRegistryError ?? null
	};
}

export function createWorkflowWorkspaceBootstrapData(
	bootstrap: RepoConfigsBootstrap
): WorkflowWorkspaceBootstrapData {
	return {
		identity: createWorkflowRouteDataIdentity(bootstrap.repositoryIdentity, {
			hasEditableDraft: Boolean(bootstrap.activeDraftBranch)
		}),
		rootConfig: bootstrap.rootConfig,
		configs: bootstrap.configs,
		navigationManifest: bootstrap.navigationManifest,
		blockSupport: createWorkflowBlockSupportData({
			blockConfigs: bootstrap.blockConfigs,
			packageBlocks: []
		}),
		changedContentPaths: bootstrap.changedPaths ?? []
	};
}

export function createWorkflowCollectionNavigationData(input: {
	identity?: WorkflowRouteDataIdentity | null;
	slug: string;
	navigation: OrderedCollectionNavigation;
	cacheMiss?: WorkflowCacheMissResult | null;
}): WorkflowCollectionNavigationData {
	return {
		identity: input.identity ?? null,
		slug: input.slug,
		navigation: input.navigation,
		readiness: 'ready',
		cacheMiss: input.cacheMiss ?? null
	};
}

export function createWorkflowPageViewData(input: {
	identity?: WorkflowRouteDataIdentity | null;
	slug: string;
	discoveredConfig?: DiscoveredConfig | null;
	content?: ContentDocument | null;
	collectionNavigation?: OrderedCollectionNavigation | null;
	blockSupport?: WorkflowBlockSupportData | null;
	contentError?: string | null;
	cacheMiss?: WorkflowCacheMissResult | null;
}): WorkflowPageViewData {
	const hasData = input.content != null || input.collectionNavigation != null;
	return {
		identity: input.identity ?? null,
		slug: input.slug,
		discoveredConfig: input.discoveredConfig ?? null,
		content: input.content ?? null,
		collectionNavigation: input.collectionNavigation ?? null,
		blockSupport: input.blockSupport ?? createWorkflowBlockSupportData({}),
		contentError: input.contentError ?? null,
		readiness: input.contentError ? 'error' : hasData ? 'ready' : 'missing',
		cacheMiss: input.cacheMiss ?? null
	};
}

export function createWorkflowItemViewData(input: {
	identity?: WorkflowRouteDataIdentity | null;
	slug: string;
	itemId: string;
	discoveredConfig?: DiscoveredConfig | null;
	item?: ContentRecord | null;
	navigationManifest?: NavigationManifestState | null;
	blockSupport?: WorkflowBlockSupportData | null;
	contentError?: string | null;
	cacheMiss?: WorkflowCacheMissResult | null;
}): WorkflowItemViewData {
	return {
		identity: input.identity ?? null,
		slug: input.slug,
		itemId: input.itemId,
		discoveredConfig: input.discoveredConfig ?? null,
		item: input.item ?? null,
		navigationManifest: input.navigationManifest ?? null,
		blockSupport: input.blockSupport ?? createWorkflowBlockSupportData({}),
		contentError: input.contentError ?? null,
		readiness: input.contentError ? 'error' : input.item != null ? 'ready' : 'missing',
		cacheMiss: input.cacheMiss ?? null
	};
}

export function createWorkflowConfigStatesData(input: {
	identity?: WorkflowRouteDataIdentity | null;
	statesBySlug: Record<string, ResolvedContentState>;
	stateConfigCount: number;
	cacheMiss?: WorkflowCacheMissResult | null;
}): WorkflowConfigStatesData {
	return {
		identity: input.identity ?? null,
		statesBySlug: input.statesBySlug,
		stateConfigCount: input.stateConfigCount,
		readiness: 'ready',
		cacheMiss: input.cacheMiss ?? null
	};
}

export function createWorkflowFreshnessData(
	freshness: RepoFreshnessIdentityResult
): WorkflowFreshnessData {
	return {
		identity: createWorkflowRouteDataIdentity(freshness.repositoryIdentity, {
			hasEditableDraft: Boolean(freshness.activeDraftBranch)
		}),
		status: freshness.freshnessStatus ?? (freshness.unchanged ? 'unchanged' : 'unknown'),
		unchanged: freshness.unchanged,
		changedContentPaths: freshness.changedPaths ?? [],
		error: freshness.error ?? null,
		recovery: freshness.recovery ?? null
	};
}
