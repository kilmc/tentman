import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoConfigs } from '$lib/server/repo-config-bootstrap';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const workspace = resolveWorkspaceState({
		isAuthenticated: locals.isAuthenticated,
		selectedBackend: locals.selectedBackend ?? null,
		selectedRepo: locals.selectedRepo ?? null,
		rootConfig: locals.rootConfig ?? null
	});

	logDevRouting('pages-layout:workspace', {
		mode: workspace.mode,
		isAuthenticated: workspace.isAuthenticated,
		selectedRepo: workspace.selectedRepo?.full_name ?? null
	});

	if (workspace.mode !== 'github') {
		return {
			...EMPTY_REPO_CONFIGS_BOOTSTRAP
		};
	}

	try {
		const bootstrap = await loadSelectedGitHubRepoConfigs(locals, cookies);
		logDevRouting('pages-layout:bootstrap-success', {
			selectedRepo: workspace.selectedRepo.full_name,
			configCount: bootstrap.configs.length
		});
		return bootstrap;
	} catch (error) {
		logDevRouting('pages-layout:bootstrap-error', {
			selectedRepo: workspace.selectedRepo.full_name,
			status: error && typeof error === 'object' && 'status' in error ? error.status : null,
			message: error instanceof Error ? error.message : 'Unknown error'
		});
		handleGitHubSessionError({ cookies }, error, { redirectTo: '/pages' });
		throw error;
	}
};
