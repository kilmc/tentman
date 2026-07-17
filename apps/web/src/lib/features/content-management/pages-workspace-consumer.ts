import type { DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import type { NavigationDraftCollection } from '$lib/features/content-management/navigation-draft';
import type {
	NavigationManifest,
	NavigationManifestState
} from '$lib/features/content-management/navigation-manifest';
import type { OrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type { WorkflowWorkspaceBootstrapData } from '$lib/repository/workflow-data';
import type { SelectedBackend } from '$lib/repository/selection';

export type PagesWorkspaceMode = 'none' | 'local' | 'github';

export type PagesWorkspaceCapabilities = {
	canRefreshWorkspace: boolean;
	canClearCache: boolean;
	canWarmRoutes: boolean;
	canUseDraftBranches: boolean;
};

export type PagesWorkspaceSurface = {
	mode: PagesWorkspaceMode;
	isLocalMode: boolean;
	capabilities: PagesWorkspaceCapabilities;
	configs: DiscoveredConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	instructionDiscovery: InstructionDiscoveryResult;
	canAddPage: boolean;
	repoLabel: string | null;
};

type LayoutWorkspaceData = {
	selectedRepo?: { full_name: string; name?: string | null } | null;
	selectedBackend?: SelectedBackend | null;
	configs?: DiscoveredConfig[] | null;
	rootConfig?: RootConfig | null;
	navigationManifest?: NavigationManifestState | null;
	instructionDiscovery?: InstructionDiscoveryResult | null;
	workflowData?: WorkflowWorkspaceBootstrapData | null;
};

type LocalWorkspaceData = {
	status?: string;
	configs?: DiscoveredConfig[] | null;
	rootConfig?: RootConfig | null;
	navigationManifest?: NavigationManifestState | null;
	instructionDiscovery?: InstructionDiscoveryResult | null;
	workflowData?: WorkflowWorkspaceBootstrapData | null;
};

export type ResolvePagesWorkspaceSurfaceInput = {
	selectedBackend: SelectedBackend | null | undefined;
	layoutData: LayoutWorkspaceData;
	localContent: LocalWorkspaceData;
};

export type LoadCollectionNavigationIntent = {
	type: 'load-collection-navigation';
	config: DiscoveredConfig;
	force?: boolean;
	hydrateRemaining?: boolean;
};

export type PagesWorkspaceIntent =
	| { type: 'start-workspace' }
	| { type: 'stop-workspace' }
	| { type: 'switch-workspace' }
	| { type: 'refresh-workspace' }
	| { type: 'clear-workspace-cache' }
	| LoadCollectionNavigationIntent
	| { type: 'load-config-states'; force?: boolean }
	| { type: 'save-navigation'; manifest: NavigationManifest }
	| {
			type: 'save-collection-order';
			config: DiscoveredConfig;
			collection: NavigationDraftCollection;
	  }
	| { type: 'promote-route'; slug: string }
	| { type: 'promote-collection-item'; slug: string; itemId: string };

export type PagesWorkspaceAdapterResult =
	| { type: 'workspace-started' }
	| { type: 'workspace-stopped' }
	| { type: 'workspace-switched' }
	| { type: 'workspace-refreshed'; message: string; remountWorkspace: boolean }
	| {
			type: 'workspace-cache-cleared';
			message: string;
			resetCollections: boolean;
			resetConfigStates: boolean;
	  }
	| {
			type: 'collection-navigation-loaded';
			slug: string;
			navigation: OrderedCollectionNavigation;
	  }
	| { type: 'collection-navigation-loading'; slug: string }
	| { type: 'collection-navigation-error'; slug: string; error: string }
	| { type: 'config-states-loaded'; statesBySlug: Record<string, ResolvedContentState | null> }
	| {
			type: 'navigation-saved';
			message: string;
			branchName?: string | null;
			invalidateWorkspace: boolean;
			localCollections?: Record<string, OrderedCollectionNavigation>;
			localConfigStates?: Record<string, ResolvedContentState | null>;
	  }
	| {
			type: 'collection-order-saved';
			message: string;
			slug: string;
			branchName?: string | null;
			invalidateWorkspace: boolean;
			navigation?: OrderedCollectionNavigation;
			localCollections?: Record<string, OrderedCollectionNavigation>;
			localConfigStates?: Record<string, ResolvedContentState | null>;
	  }
	| { type: 'route-promoted' }
	| { type: 'session-expired' };

export type PagesWorkspaceAdapter = {
	startWorkspace(): Promise<PagesWorkspaceAdapterResult>;
	stopWorkspace(): void;
	watchCollectionNavigation(
		input: { slug: string },
		listener: (result: PagesWorkspaceAdapterResult) => void
	): () => void;
	switchWorkspace(): Promise<PagesWorkspaceAdapterResult>;
	refreshWorkspace(): Promise<PagesWorkspaceAdapterResult>;
	clearWorkspaceCache(): Promise<PagesWorkspaceAdapterResult>;
	loadCollectionNavigation(input: {
		config: DiscoveredConfig;
		force?: boolean;
		hydrateRemaining?: boolean;
	}): Promise<PagesWorkspaceAdapterResult>;
	loadConfigStates(input?: { force?: boolean }): Promise<PagesWorkspaceAdapterResult>;
	saveNavigation(input: {
		manifest: NavigationManifest;
	}): Promise<PagesWorkspaceAdapterResult>;
	saveCollectionOrder(input: {
		config: DiscoveredConfig;
		collection: NavigationDraftCollection;
	}): Promise<PagesWorkspaceAdapterResult>;
	promoteRoute(input: { slug: string }): PagesWorkspaceAdapterResult;
	promoteCollectionItem(input: { slug: string; itemId: string }): PagesWorkspaceAdapterResult;
};

const EMPTY_INSTRUCTION_DISCOVERY: InstructionDiscoveryResult = {
	instructions: [],
	issues: []
};

const EMPTY_NAVIGATION_MANIFEST: NavigationManifestState = {
	path: 'tentman/navigation-manifest.json',
	exists: false,
	manifest: null,
	error: null
};

const CAPABILITIES_BY_MODE: Record<PagesWorkspaceMode, PagesWorkspaceCapabilities> = {
	none: {
		canRefreshWorkspace: false,
		canClearCache: false,
		canWarmRoutes: false,
		canUseDraftBranches: false
	},
	local: {
		canRefreshWorkspace: true,
		canClearCache: false,
		canWarmRoutes: false,
		canUseDraftBranches: false
	},
	github: {
		canRefreshWorkspace: false,
		canClearCache: true,
		canWarmRoutes: true,
		canUseDraftBranches: true
	}
};

function getMode(selectedBackend: SelectedBackend | null | undefined): PagesWorkspaceMode {
	if (selectedBackend?.kind === 'local') {
		return 'local';
	}

	if (selectedBackend?.kind === 'github') {
		return 'github';
	}

	return 'none';
}

function getInstructionDiscovery(
	mode: PagesWorkspaceMode,
	layoutData: LayoutWorkspaceData,
	localContent: LocalWorkspaceData
): InstructionDiscoveryResult {
	return (
		(mode === 'local' ? localContent.instructionDiscovery : layoutData.instructionDiscovery) ??
		EMPTY_INSTRUCTION_DISCOVERY
	);
}

function getRepoLabel(
	mode: PagesWorkspaceMode,
	selectedBackend: SelectedBackend | null | undefined,
	layoutData: LayoutWorkspaceData
): string | null {
	if (mode === 'github') {
		return layoutData.selectedRepo?.full_name ?? null;
	}

	if (mode === 'local' && selectedBackend?.kind === 'local') {
		return selectedBackend.repo.pathLabel ?? selectedBackend.repo.name ?? null;
	}

	return null;
}

export function resolvePagesWorkspaceSurface(
	input: ResolvePagesWorkspaceSurfaceInput
): PagesWorkspaceSurface {
	const mode = getMode(input.selectedBackend);
	const workflowData =
		mode === 'local'
			? (input.localContent.workflowData ?? null)
			: mode === 'github'
				? (input.layoutData.workflowData ?? null)
				: null;
	const instructionDiscovery = getInstructionDiscovery(
		mode,
		input.layoutData,
		input.localContent
	);

	return {
		mode,
		isLocalMode: mode === 'local',
		capabilities: CAPABILITIES_BY_MODE[mode],
		configs:
			mode === 'local'
				? (workflowData?.configs ?? input.localContent.configs ?? [])
				: (workflowData?.configs ?? input.layoutData.configs ?? []),
		rootConfig:
			mode === 'local'
				? (workflowData?.rootConfig ?? input.localContent.rootConfig ?? null)
				: (workflowData?.rootConfig ?? input.layoutData.rootConfig ?? null),
		navigationManifest:
			mode === 'local'
				? (workflowData?.navigationManifest ??
					input.localContent.navigationManifest ??
					EMPTY_NAVIGATION_MANIFEST)
				: (workflowData?.navigationManifest ??
					input.layoutData.navigationManifest ??
					EMPTY_NAVIGATION_MANIFEST),
		instructionDiscovery,
		canAddPage: instructionDiscovery.instructions.length > 0,
		repoLabel: getRepoLabel(mode, input.selectedBackend, input.layoutData)
	};
}

export function createPagesWorkspaceConsumer(adapter: PagesWorkspaceAdapter) {
	return {
		watchCollectionNavigation(
			slug: string,
			listener: (result: PagesWorkspaceAdapterResult) => void
		): () => void {
			return adapter.watchCollectionNavigation({ slug }, listener);
		},

		run(intent: PagesWorkspaceIntent): Promise<PagesWorkspaceAdapterResult> {
			switch (intent.type) {
				case 'start-workspace':
					return adapter.startWorkspace();
				case 'stop-workspace':
					adapter.stopWorkspace();
					return Promise.resolve({ type: 'workspace-stopped' });
				case 'switch-workspace':
					return adapter.switchWorkspace();
				case 'refresh-workspace':
					return adapter.refreshWorkspace();
				case 'clear-workspace-cache':
					return adapter.clearWorkspaceCache();
				case 'load-collection-navigation':
					return adapter.loadCollectionNavigation({
						config: intent.config,
						force: intent.force,
						hydrateRemaining: intent.hydrateRemaining
					});
				case 'load-config-states':
					return adapter.loadConfigStates({ force: intent.force });
				case 'save-navigation':
					return adapter.saveNavigation({ manifest: intent.manifest });
				case 'save-collection-order':
					return adapter.saveCollectionOrder({
						config: intent.config,
						collection: intent.collection
					});
				case 'promote-route':
					return Promise.resolve(adapter.promoteRoute({ slug: intent.slug }));
				case 'promote-collection-item':
					return Promise.resolve(
						adapter.promoteCollectionItem({ slug: intent.slug, itemId: intent.itemId })
					);
			}
		}
	};
}
