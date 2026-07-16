import { redirect } from '@sveltejs/kit';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	loadRepoConfigsBootstrap,
	type RepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import { markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';
import type { LayoutLoad } from './$types';

const EMPTY_INSTRUCTION_DISCOVERY: InstructionDiscoveryResult = {
	instructions: [],
	issues: []
};

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

export const load: LayoutLoad = async ({ parent, fetch }) => {
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
		return {
			...EMPTY_REPO_CONFIGS_BOOTSTRAP,
			instructionDiscovery: EMPTY_INSTRUCTION_DISCOVERY
		};
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
			mark: 'bootstrap-ready',
			route: '/pages'
		});
		return {
			...workspaceBootstrap,
			instructionDiscovery
		};
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
