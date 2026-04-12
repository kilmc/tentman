import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import { resolveWorkspaceState } from '$lib/repository/workspace-state';
import { requireGitHubRepository, handleGitHubRouteError } from '$lib/server/page-context';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';
import { buildPathWithQuery, buildReposReturnHref } from '$lib/utils/routing';
import type { LayoutData, PageServerLoad } from './$types';

type ChangedPageSummary = {
	slug: string;
	label: string;
	changeCount: number;
	isCollection: boolean;
};

export const load: PageServerLoad = async ({ parent, locals, cookies }) => {
	const parentData = (await parent()) as LayoutData;
	const requestLocals = locals ?? {};
	const workspace = resolveWorkspaceState({
		isAuthenticated: requestLocals.isAuthenticated ?? parentData.isAuthenticated,
		selectedBackend: requestLocals.selectedBackend ?? parentData.selectedBackend ?? null,
		selectedRepo: requestLocals.selectedRepo ?? parentData.selectedRepo ?? null,
		rootConfig: requestLocals.rootConfig ?? parentData.rootConfig ?? null
	});
	const configs = parentData.configs ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.configs;
	const navigationManifest =
		parentData.navigationManifest ?? EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest;

	if (workspace.mode === 'local') {
		return {
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: configs.length > 0
			}
		};
	}

	if (!workspace.isAuthenticated) {
		throw redirect(
			302,
			dev
				? buildPathWithQuery('/repos', {
						returnTo: '/pages',
						debugFailure: 'pages-overview-unauthenticated'
					})
				: buildReposReturnHref('/repos', '/pages')
		);
	}

	if (workspace.mode !== 'github') {
		throw redirect(
			302,
			dev
				? buildPathWithQuery('/repos', {
						returnTo: '/pages',
						debugFailure: 'pages-overview-missing-repo'
					})
				: '/repos'
		);
	}

	const orderedConfigs = orderDiscoveredConfigs(configs, navigationManifest.manifest);

	if (orderedConfigs.length === 0) {
		return {
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: false
			}
		};
	}

	try {
		const { octokit, owner, name } = requireGitHubRepository({ locals, cookies }, '/pages');
		const draftBranch = await getLatestPreviewBranchName(octokit, owner, name);

		if (!draftBranch) {
			return {
				summary: {
					draftBranch: null,
					changedPages: [],
					totalChanges: 0,
					hasConfigs: true
				}
			};
		}

		const changedPages = (
			await Promise.all(
				orderedConfigs.map(async (config): Promise<ChangedPageSummary | null> => {
					const draftChanges = await compareDraftToBranch(
						octokit,
						owner,
						name,
						config.config,
						config.path,
						draftBranch
					);
					const changeCount =
						draftChanges.modified.length +
						draftChanges.created.length +
						draftChanges.deleted.length;

					if (changeCount === 0) {
						return null;
					}

					return {
						slug: config.slug,
						label: config.config.label,
						changeCount,
						isCollection: !!config.config.collection
					};
				})
			)
		).filter((value): value is ChangedPageSummary => value !== null);

		return {
			summary: {
				draftBranch,
				changedPages,
				totalChanges: changedPages.reduce((total, page) => total + page.changeCount, 0),
				hasConfigs: true
			}
		};
	} catch (error) {
		handleGitHubRouteError({ locals, cookies }, error, '/pages');
		console.error('Failed to load pages overview summary:', error);

		return {
			summary: {
				draftBranch: null,
				changedPages: [],
				totalChanges: 0,
				hasConfigs: true
			}
		};
	}
};
