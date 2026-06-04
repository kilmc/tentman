import { error } from '@sveltejs/kit';
import {
	normalizeRepoConfigsBootstrap,
	type RepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { getRepositorySnapshot } from '$lib/server/repository-data';

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
	const snapshot = await getRepositorySnapshot({ backend, ref: draftBranch });

	return {
		backend,
		draftBranch,
		...normalizeRepoConfigsBootstrap({
			configs: snapshot.configIndex.configs,
			blockConfigs: snapshot.blockConfigIndex.configs,
			rootConfig: snapshot.rootConfig,
			activeDraftBranch: draftBranch,
			navigationManifest: snapshot.navigationManifest
		})
	};
}

export async function loadSelectedGitHubRepoConfigs(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>
): Promise<RepoConfigsBootstrap> {
	const {
		backend: _backend,
		draftBranch: _draftBranch,
		...bootstrap
	} = await loadSelectedGitHubRepoBootstrapContext(locals, cookies);
	return bootstrap;
}
