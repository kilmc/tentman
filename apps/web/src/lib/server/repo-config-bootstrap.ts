import { error } from '@sveltejs/kit';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import {
	normalizeRepoConfigsBootstrap,
	type RepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { requireGitHubContentRepository } from '$lib/server/page-context';

export interface SelectedGitHubRepoBootstrapContext extends RepoConfigsBootstrap {
	backend: Awaited<ReturnType<typeof requireGitHubContentRepository>>['backend'];
	draftBranch: string | null;
}

export async function loadSelectedGitHubRepoBootstrapContext(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>
): Promise<SelectedGitHubRepoBootstrapContext> {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const { backend, draftBranch } = await requireGitHubContentRepository({ locals, cookies });
	const [configs, blockConfigs, rootConfig, navigationManifest] = await Promise.all([
		getCachedConfigs(backend),
		backend.discoverBlockConfigs(),
		backend.readRootConfig(),
		loadNavigationManifestState(backend)
	]);

	return {
		backend,
		draftBranch,
		...normalizeRepoConfigsBootstrap({
			configs,
			blockConfigs,
			rootConfig,
			activeDraftBranch: draftBranch,
			navigationManifest
		})
	};
}

export async function loadSelectedGitHubRepoConfigs(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>
): Promise<RepoConfigsBootstrap> {
	const { backend: _backend, draftBranch: _draftBranch, ...bootstrap } =
		await loadSelectedGitHubRepoBootstrapContext(locals, cookies);
	return bootstrap;
}
