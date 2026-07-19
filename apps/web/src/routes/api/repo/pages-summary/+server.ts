// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import {
	createEmptyPagesOverviewSummary,
	type PagesOverviewSummaryStatus,
	type PagesOverviewSummaryRequest
} from '$lib/features/content-management/overview-summary';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';
import { getDraftChangeIndex } from '$lib/server/repository-data';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';
import { logRouteDataFallback } from '$lib/utils/workflow-instrumentation';
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

function buildSummaryStatus(
	degradedPages: PagesOverviewSummaryStatus['degradedPages']
): PagesOverviewSummaryStatus {
	if (degradedPages.length) {
		return {
			mode: 'degraded',
			source: 'unsupported-scope',
			message:
				'Tentman used scoped compare metadata and skipped collection-wide draft comparison for pages that need a narrower review path.',
			degradedPages
		};
	}

	return {
		mode: 'scoped',
		source: 'compare-metadata',
		message: 'Tentman summarized this draft from compare metadata.',
		degradedPages: []
	};
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
							const changeCount =
								(changeScope?.modified.length ?? 0) +
								(changeScope?.created.length ?? 0) +
								(changeScope?.deleted.length ?? 0);

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
				const degradedPages = orderedConfigs.flatMap((config) => {
					const changeScope = draftChangeIndex.byConfigSlug.get(config.slug);
					if (!changeScope?.requiresFullFetch) {
						return [];
					}

					const reason = `${config.config.label} needs full document comparison, which is unsupported on the scoped pages-summary path.`;
					logRouteDataFallback({
						route: '/pages',
						slug: config.slug,
						source: 'pages-summary',
						reason
					});
					return [
						{
							slug: config.slug,
							label: config.config.label,
							reason
						}
					];
				});

				logTiming('api.repo.pages-summary.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					configCount: orderedConfigs.length,
					changedPageCount: changedPages.length,
					totalChanges: changedPages.reduce((total, page) => total + page.changeCount, 0),
					status: degradedPages.length ? 'degraded' : 'scoped'
				});

				return json({
					draftBranch,
					changedPages,
					totalChanges: changedPages.reduce((total, page) => total + page.changeCount, 0),
					hasConfigs: true,
					status: buildSummaryStatus(degradedPages)
				});
			}
		);
	} catch (err) {
		handleGitHubRouteError({ locals, cookies }, err, '/pages');
		console.error('Failed to load pages overview summary:', err);

		return json(createEmptyPagesOverviewSummary(true));
	}
};
