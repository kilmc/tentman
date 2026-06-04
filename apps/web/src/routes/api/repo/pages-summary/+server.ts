// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import {
	createEmptyPagesOverviewSummary,
	type PagesOverviewSummaryRequest
} from '$lib/features/content-management/overview-summary';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';
import { getDraftChangeIndex } from '$lib/server/repository-data';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

function isPagesOverviewSummaryRequest(value: unknown): value is PagesOverviewSummaryRequest {
	if (!value || typeof value !== 'object') {
		return false;
	}

	return (
		'configs' in value &&
		Array.isArray(value.configs) &&
		'navigationManifest' in value &&
		Boolean(value.navigationManifest) &&
		typeof value.navigationManifest === 'object'
	);
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const body = (await request.json()) as unknown;

	if (!isPagesOverviewSummaryRequest(body)) {
		throw error(400, 'Invalid pages summary request');
	}

	const orderedConfigs = orderDiscoveredConfigs(body.configs, body.navigationManifest.manifest);

	if (orderedConfigs.length === 0) {
		return json(createEmptyPagesOverviewSummary(false));
	}

	try {
		return await timeAsync(
			'api.repo.pages-summary',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				configCount: orderedConfigs.length
			},
			async () => {
				const { octokit, owner, name, defaultBranch } = requireGitHubRepository(
					{ locals, cookies },
					'/pages'
				);
				const draftBranch = await getTentmanDraftBranchName(octokit, owner, name);

				if (!draftBranch) {
					return json(createEmptyPagesOverviewSummary(true));
				}

				const draftChangeIndex = await getDraftChangeIndex({
					octokit,
					owner,
					repo: name,
					baseBranch: defaultBranch,
					draftBranch,
					configs: orderedConfigs
				});
				const changedPages = (
					await Promise.all(
						orderedConfigs.map(async (config) => {
							const changeScope = draftChangeIndex.byConfigSlug.get(config.slug);
							let changeCount =
								(changeScope?.modified.length ?? 0) +
								(changeScope?.created.length ?? 0) +
								(changeScope?.deleted.length ?? 0);

							if (changeScope?.requiresFullFetch) {
								const draftChanges = await compareDraftToBranch(
									octokit,
									owner,
									name,
									defaultBranch,
									config.config,
									config.path,
									draftBranch,
									{
										comparisonContext: {
											metadata: draftChangeIndex.metadata,
											changedFiles: draftChangeIndex.files,
											canUseCheapComparison: true
										}
									}
								);
								changeCount =
									draftChanges.modified.length +
									draftChanges.created.length +
									draftChanges.deleted.length;
							}

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
				).filter((value) => value !== null);

				logTiming('api.repo.pages-summary.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					configCount: orderedConfigs.length,
					changedPageCount: changedPages.length,
					totalChanges: changedPages.reduce((total, page) => total + page.changeCount, 0)
				});

				return json({
					draftBranch,
					changedPages,
					totalChanges: changedPages.reduce((total, page) => total + page.changeCount, 0),
					hasConfigs: true
				});
			}
		);
	} catch (err) {
		handleGitHubRouteError({ locals, cookies }, err, '/pages');
		console.error('Failed to load pages overview summary:', err);

		return json(createEmptyPagesOverviewSummary(true));
	}
};
