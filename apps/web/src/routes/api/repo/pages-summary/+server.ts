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

				const changedPages = (
					await Promise.all(
						orderedConfigs.map(async (config) => {
							const draftChanges = await compareDraftToBranch(
								octokit,
								owner,
								name,
								defaultBranch,
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
