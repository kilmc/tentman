import { redirect } from '@sveltejs/kit';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	loadRepoConfigsBootstrap,
	type RepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import { resolveWorkspaceState, type WorkspaceState } from '$lib/repository/workspace-state';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import { logRouteDataFallback, markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';
import type { LayoutLoad } from './$types';

const EMPTY_INSTRUCTION_DISCOVERY: InstructionDiscoveryResult = {
	instructions: [],
	issues: []
};

type PagesWorkspaceWarmReturnData = RepoConfigsBootstrap & {
	instructionDiscovery: InstructionDiscoveryResult;
};

type PagesWorkspaceWarmReturnCacheEntry = {
	repoFullName: string;
	repositoryIdentityKey: string;
	data: PagesWorkspaceWarmReturnData;
};

let pagesWorkspaceWarmReturnCache: PagesWorkspaceWarmReturnCacheEntry | null = null;

function getWorkflowFreshnessStatus(
	status: NonNullable<RepoConfigsBootstrap['workflowData']>['freshness']['status']
): RepoConfigsBootstrap['freshnessStatus'] | undefined {
	return status === 'unknown' ? undefined : status;
}

function normalizePagesWorkspaceBootstrap(bootstrap: RepoConfigsBootstrap): RepoConfigsBootstrap {
	const workflowData = bootstrap.workflowData;

	if (!workflowData) {
		return bootstrap;
	}

	return {
		...bootstrap,
		configs: workflowData.configs,
		blockConfigs: workflowData.blockSupport.blockConfigs,
		rootConfig: workflowData.rootConfig,
		navigationManifest: workflowData.navigationManifest,
		changedPaths: workflowData.changedContentPaths,
		freshnessStatus:
			getWorkflowFreshnessStatus(workflowData.freshness.status) ?? bootstrap.freshnessStatus,
		freshnessError: workflowData.freshness.error,
		freshnessRecovery: workflowData.freshness.recovery
	};
}

function getRepositoryIdentityKey(bootstrap: RepoConfigsBootstrap): string | null {
	const identity = bootstrap.repositoryIdentity;

	if (!identity) {
		return null;
	}

	return [identity.repoKey, identity.ref, identity.headSha, identity.treeSha].join(':');
}

function getCurrentRepositoryIdentityKey(workspace: WorkspaceState): string | null {
	if (workspace.mode !== 'github') {
		return null;
	}

	const identity = workspace.selectedRepoConfigSummary?.repositoryIdentity;

	if (!identity) {
		return null;
	}

	return [identity.repoKey, identity.ref, identity.headSha, identity.treeSha].join(':');
}

function getWarmReturnCacheEntry(workspace: WorkspaceState): PagesWorkspaceWarmReturnData | null {
	if (workspace.mode !== 'github' || !pagesWorkspaceWarmReturnCache) {
		return null;
	}

	if (pagesWorkspaceWarmReturnCache.repoFullName !== workspace.selectedRepo.full_name) {
		return null;
	}

	const currentRepositoryIdentityKey = getCurrentRepositoryIdentityKey(workspace);
	if (!currentRepositoryIdentityKey) {
		logRouteDataFallback({
			route: '/pages',
			slug: null,
			source: 'pages-layout:warm-return',
			reason: 'repository-identity-unavailable'
		});
		return null;
	}

	if (currentRepositoryIdentityKey !== pagesWorkspaceWarmReturnCache.repositoryIdentityKey) {
		logRouteDataFallback({
			route: '/pages',
			slug: null,
			source: 'pages-layout:warm-return',
			reason: 'repository-identity-changed'
		});
		return null;
	}

	return pagesWorkspaceWarmReturnCache.data;
}

function shouldBypassWarmReturn(url: URL | undefined): boolean {
	return (
		url?.searchParams.has('merged') === true ||
		url?.searchParams.has('cancelled') === true ||
		url?.searchParams.has('published') === true
	);
}

function cacheWarmReturnData(input: {
	workspace: WorkspaceState;
	data: PagesWorkspaceWarmReturnData;
}): void {
	if (input.workspace.mode !== 'github') {
		pagesWorkspaceWarmReturnCache = null;
		return;
	}

	const repositoryIdentityKey = getRepositoryIdentityKey(input.data);

	if (!repositoryIdentityKey) {
		return;
	}

	pagesWorkspaceWarmReturnCache = {
		repoFullName: input.workspace.selectedRepo.full_name,
		repositoryIdentityKey,
		data: input.data
	};
}

export function _clearPagesWorkspaceWarmReturnCacheForTests(): void {
	pagesWorkspaceWarmReturnCache = null;
}

async function loadInstructionDiscovery(fetch: typeof globalThis.fetch) {
	try {
		const response = await fetch('/api/repo/instructions');
		if (!response.ok) {
			return EMPTY_INSTRUCTION_DISCOVERY;
		}

		return (await response.json()) as InstructionDiscoveryResult;
	} catch {
		return EMPTY_INSTRUCTION_DISCOVERY;
	}
}

export const load: LayoutLoad = async ({ parent, fetch, url }) => {
	const parentData = await parent();
	const workspace = resolveWorkspaceState({
		isAuthenticated: parentData.isAuthenticated,
		selectedBackend: parentData.selectedBackend ?? null,
		selectedRepo: parentData.selectedRepo ?? null,
		selectedRepoConfigSummary: parentData.selectedRepoConfigSummary ?? null
	});

	logDevRouting('pages-layout:workspace', {
		mode: workspace.mode,
		isAuthenticated: workspace.isAuthenticated,
		selectedRepo: workspace.selectedRepo?.full_name ?? null
	});

	if (workspace.mode !== 'github') {
		pagesWorkspaceWarmReturnCache = null;
		return {
			...EMPTY_REPO_CONFIGS_BOOTSTRAP,
			instructionDiscovery: EMPTY_INSTRUCTION_DISCOVERY
		};
	}

	if (shouldBypassWarmReturn(url)) {
		pagesWorkspaceWarmReturnCache = null;
	}

	const warmReturnData = getWarmReturnCacheEntry(workspace);
	if (warmReturnData) {
		logDevRouting('pages-layout:warm-return', {
			selectedRepo: workspace.selectedRepo.full_name
		});
		markWorkflowReadiness({
			workflow: 'return-to-pages',
			mark: 'workspace-shell-ready',
			route: '/pages'
		});
		markWorkflowReadiness({
			workflow: 'return-to-pages',
			mark: 'validation-deferred',
			route: '/pages'
		});
		return warmReturnData;
	}

	try {
		const [bootstrap, instructionDiscovery] = await Promise.all([
			loadRepoConfigsBootstrap(fetch),
			loadInstructionDiscovery(fetch)
		]);
		const workspaceBootstrap = normalizePagesWorkspaceBootstrap(bootstrap);
		logDevRouting('pages-layout:bootstrap-success', {
			selectedRepo: workspace.selectedRepo.full_name,
			configCount: workspaceBootstrap.configs.length
		});
		markWorkflowReadiness({
			workflow: 'first-repository-open',
			mark: 'workspace-bootstrap-ready',
			route: '/pages'
		});
		const data = {
			...workspaceBootstrap,
			instructionDiscovery
		};
		cacheWarmReturnData({
			workspace,
			data
		});
		return data;
	} catch (error) {
		logDevRouting('pages-layout:bootstrap-error', {
			selectedRepo: workspace.selectedRepo.full_name,
			status: error && typeof error === 'object' && 'status' in error ? error.status : null,
			message: error instanceof Error ? error.message : 'Unknown error'
		});

		if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
			throw redirect(302, '/repos?returnTo=%2Fpages');
		}

		throw error;
	}
};
