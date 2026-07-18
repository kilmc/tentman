import type { SerializablePackageBlock } from '$lib/blocks/packages';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { OrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
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
export type WorkflowCacheMissRecovery =
	| 'fetch-route-data'
	| 'refresh-workspace'
	| 'keep-current-data';
export type WorkflowFreshnessStatus = 'unchanged' | 'changed' | 'stale' | 'error' | 'unknown';
export type WorkflowEditorStatus = 'published' | 'draft';

export interface WorkflowRouteDataIdentity {
	mode: WorkflowDataMode;
	workspaceKey: string;
	workspaceLabel: string;
	dataSetKey: string;
	resolvedAt: number | null;
	hasEditableDraft: boolean;
}

export interface WorkflowEditorState {
	status: WorkflowEditorStatus;
	isDraft: boolean;
	recoveryContextKey: string;
	message: string | null;
}

export interface WorkflowBlockSupportData {
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	error: string | null;
	readiness: WorkflowDataReadiness;
	cacheMiss: WorkflowCacheMissResult | null;
}

export interface WorkflowWorkspaceBootstrapData {
	identity: WorkflowRouteDataIdentity | null;
	rootConfig: RootConfig | null;
	configs: DiscoveredConfig[];
	navigationManifest: NavigationManifestState;
	blockSupport: WorkflowBlockSupportData;
	changedContentPaths: string[];
	freshness: WorkflowFreshnessData;
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
	editor: WorkflowEditorState;
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
	editor: WorkflowEditorState;
	contentError: string | null;
	readiness: WorkflowDataReadiness;
	cacheMiss: WorkflowCacheMissResult | null;
}

export interface WorkflowConfigStatesData {
	identity: WorkflowRouteDataIdentity | null;
	statesBySlug: Record<string, ResolvedContentState | null>;
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
	status: number | null;
	reason: string;
	recovery: WorkflowCacheMissRecovery;
}

function hashDataSetParts(parts: string[]): string {
	const value = parts.join('\u001f');
	let hash = 0x811c9dc5;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return `dataset:${(hash >>> 0).toString(36)}`;
}

function getRepositoryDataSetKey(identity: RepoBootstrapIdentity): string {
	return hashDataSetParts([
		identity.mode,
		identity.repoKey,
		identity.ref,
		identity.headSha,
		identity.treeSha
	]);
}

export function createOpaqueWorkflowRouteDataIdentity(input: {
	mode: WorkflowDataMode;
	workspaceKey: string;
	workspaceLabel: string;
	dataSetParts: string[];
	resolvedAt?: number | null;
	hasEditableDraft?: boolean;
}): WorkflowRouteDataIdentity {
	return {
		mode: input.mode,
		workspaceKey: input.workspaceKey,
		workspaceLabel: input.workspaceLabel,
		dataSetKey: hashDataSetParts([input.mode, input.workspaceKey, ...input.dataSetParts]),
		resolvedAt: input.resolvedAt ?? null,
		hasEditableDraft: input.hasEditableDraft ?? false
	};
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
		dataSetKey: getRepositoryDataSetKey(identity),
		resolvedAt: identity.resolvedAt ?? null,
		hasEditableDraft: options.hasEditableDraft ?? false
	};
}

export function createWorkflowEditorState(
	identity: WorkflowRouteDataIdentity | null | undefined
): WorkflowEditorState {
	const isDraft = Boolean(identity?.hasEditableDraft);
	const recoveryIdentity = identity
		? hashDataSetParts([identity.mode, identity.workspaceKey, identity.dataSetKey])
		: hashDataSetParts(['unknown-workflow']);

	return {
		status: isDraft ? 'draft' : 'published',
		isDraft,
		recoveryContextKey: `editor:${recoveryIdentity}`,
		message: isDraft ? 'Changes will continue in the current draft.' : null
	};
}

export function createWorkflowRouteDataIdentityFromRepositoryIdentity(input: {
	mode: WorkflowDataMode;
	workspaceKey: string;
	workspaceLabel: string;
	repositoryIdentity: RepoBootstrapIdentity | null | undefined;
	hasEditableDraft: boolean;
	dataSetParts?: string[];
}): WorkflowRouteDataIdentity {
	return (
		createWorkflowRouteDataIdentity(input.repositoryIdentity, {
			hasEditableDraft: input.hasEditableDraft
		}) ??
		createOpaqueWorkflowRouteDataIdentity({
			mode: input.mode,
			workspaceKey: input.workspaceKey,
			workspaceLabel: input.workspaceLabel,
			dataSetParts: input.dataSetParts ?? [
				input.hasEditableDraft ? 'editable-draft' : 'published-content'
			],
			hasEditableDraft: input.hasEditableDraft
		})
	);
}

export function createWorkflowEditorStateFromRepositoryIdentity(
	input: Parameters<typeof createWorkflowRouteDataIdentityFromRepositoryIdentity>[0]
): WorkflowEditorState {
	return createWorkflowEditorState(createWorkflowRouteDataIdentityFromRepositoryIdentity(input));
}

export function createWorkflowCacheMissResult(input: {
	target: WorkflowCacheMissTarget;
	slug?: string | null;
	itemId?: string | null;
	readiness?: Exclude<WorkflowDataReadiness, 'ready'>;
	status?: number | null;
	reason: string;
	recovery?: WorkflowCacheMissRecovery;
}): WorkflowCacheMissResult {
	return {
		target: input.target,
		slug: input.slug ?? null,
		itemId: input.itemId ?? null,
		readiness: input.readiness ?? 'missing',
		status: input.status ?? null,
		reason: input.reason,
		recovery: input.recovery ?? 'fetch-route-data'
	};
}

export function createWorkflowBlockSupportData(input: {
	blockConfigs?: DiscoveredBlockConfig[] | null;
	packageBlocks?: SerializablePackageBlock[] | null;
	blockRegistryError?: string | null;
	readiness?: WorkflowDataReadiness;
	cacheMiss?: WorkflowCacheMissResult | null;
}): WorkflowBlockSupportData {
	const blockRegistryError = input.blockRegistryError ?? null;
	const hasPreparedData =
		input.blockConfigs !== undefined ||
		input.packageBlocks !== undefined ||
		input.blockRegistryError !== undefined;
	return {
		blockConfigs: input.blockConfigs ?? [],
		packageBlocks: input.packageBlocks ?? [],
		error: blockRegistryError,
		readiness:
			input.readiness ?? (blockRegistryError ? 'error' : hasPreparedData ? 'ready' : 'missing'),
		cacheMiss: input.cacheMiss ?? null
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
		changedContentPaths: bootstrap.changedPaths ?? [],
		freshness: createWorkflowFreshnessData({
			activeDraftBranch: bootstrap.activeDraftBranch,
			repositoryIdentity: bootstrap.repositoryIdentity ?? null,
			mainRepositoryIdentity: bootstrap.mainRepositoryIdentity ?? null,
			draftRepositoryIdentity: bootstrap.draftRepositoryIdentity ?? null,
			unchanged: (bootstrap.freshnessStatus ?? 'unchanged') === 'unchanged',
			freshnessStatus: bootstrap.freshnessStatus ?? 'unchanged',
			changedPaths: bootstrap.changedPaths ?? [],
			error: bootstrap.freshnessError ?? null,
			recovery: bootstrap.freshnessRecovery ?? null
		})
	};
}

export function createWorkflowCollectionNavigationData(input: {
	identity?: WorkflowRouteDataIdentity | null;
	slug: string;
	navigation: OrderedCollectionNavigation;
	readiness?: WorkflowDataReadiness;
	cacheMiss?: WorkflowCacheMissResult | null;
}): WorkflowCollectionNavigationData {
	return {
		identity: input.identity ?? null,
		slug: input.slug,
		navigation: input.navigation,
		readiness: input.readiness ?? 'ready',
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
	const identity = input.identity ?? null;
	return {
		identity,
		slug: input.slug,
		discoveredConfig: input.discoveredConfig ?? null,
		content: input.content ?? null,
		collectionNavigation: input.collectionNavigation ?? null,
		blockSupport: input.blockSupport ?? createWorkflowBlockSupportData({}),
		editor: createWorkflowEditorState(identity),
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
	const identity = input.identity ?? null;
	return {
		identity,
		slug: input.slug,
		itemId: input.itemId,
		discoveredConfig: input.discoveredConfig ?? null,
		item: input.item ?? null,
		navigationManifest: input.navigationManifest ?? null,
		blockSupport: input.blockSupport ?? createWorkflowBlockSupportData({}),
		editor: createWorkflowEditorState(identity),
		contentError: input.contentError ?? null,
		readiness: input.contentError ? 'error' : input.item != null ? 'ready' : 'missing',
		cacheMiss: input.cacheMiss ?? null
	};
}

export function createWorkflowConfigStatesData(input: {
	identity?: WorkflowRouteDataIdentity | null;
	statesBySlug: Record<string, ResolvedContentState | null>;
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
