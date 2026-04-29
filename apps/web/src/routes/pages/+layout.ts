import { redirect } from '@sveltejs/kit';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	loadRepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import type { InstructionDiscoveryResult } from '$lib/features/instructions/types';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import type { LayoutLoad } from './$types';

const EMPTY_INSTRUCTION_DISCOVERY: InstructionDiscoveryResult = {
	instructions: [],
	issues: []
};

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
		rootConfig: parentData.rootConfig ?? null
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
		logDevRouting('pages-layout:bootstrap-success', {
			selectedRepo: workspace.selectedRepo.full_name,
			configCount: bootstrap.configs.length
		});
		return {
			...bootstrap,
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
