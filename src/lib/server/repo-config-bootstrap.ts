import { error } from '@sveltejs/kit';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import {
	normalizeRepoConfigsBootstrap,
	type RepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { createGitHubServerClient } from '$lib/server/auth/github';

export async function loadSelectedGitHubRepoConfigs(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>
): Promise<RepoConfigsBootstrap> {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	const backend = createGitHubRepositoryBackend(octokit, locals.selectedRepo);
	const [configs, blockConfigs, rootConfig, navigationManifest] = await Promise.all([
		getCachedConfigs(backend),
		backend.discoverBlockConfigs(),
		backend.readRootConfig(),
		loadNavigationManifestState(backend)
	]);

	return normalizeRepoConfigsBootstrap({
		configs,
		blockConfigs,
		rootConfig,
		navigationManifest
	});
}
