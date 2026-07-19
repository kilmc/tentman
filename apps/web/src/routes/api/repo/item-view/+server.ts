// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { getRepositorySnapshot } from '$lib/server/repository-data';
import { resolveCollectionItemRouteData } from '$lib/server/repository-data/route-data';
import {
	createWorkflowBlockSupportData,
	createWorkflowItemViewData,
	createWorkflowRouteDataIdentity,
	type WorkflowItemViewData
} from '$lib/repository/workflow-data';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	const itemId = url.searchParams.get('itemId');

	if (!slug || !itemId) {
		throw error(400, 'Missing page or item identifier');
	}

	const requestContext = { locals, cookies };

	try {
		return await timeAsync(
			'api.repo.item-view',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				slug,
				itemId
			},
			async () => {
				const { backend, draftBranch } = await requireGitHubContentRepository(
					requestContext,
					`/pages/${slug}/${itemId}`
				);
				const snapshot = await getRepositorySnapshot({ backend });
				const discoveredConfig = snapshot.configIndex.bySlug.get(slug);

				if (!discoveredConfig) {
					throw error(404, 'Configuration not found');
				}

				if (!discoveredConfig.config.collection) {
					return json({
						redirectTo: `/pages/${slug}/edit`
					});
				}

				let contentError = null;
				let item = null;
				let workflowData: WorkflowItemViewData | null = null;

				try {
					const resolvedItem = await resolveCollectionItemRouteData({
						backend,
						discoveredConfig,
						itemId
					});
					item = resolvedItem.item;
					workflowData = resolvedItem.workflowData;

					if (!item) {
						throw error(404, 'Item not found');
					}
				} catch (err) {
					if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
						throw err;
					}

					handleGitHubSessionError({ cookies }, err);
					logError(err, 'Fetch content');
					contentError = formatErrorMessage(err);
				}

				const { blockConfigs, packageBlocks, blockRegistryError } =
					await loadGitHubBlockRegistryData(backend, {
						blockConfigs: snapshot.blockConfigIndex.configs,
						rootConfig: snapshot.rootConfig
					});
				const navigationManifest = snapshot.navigationManifest;
				const blockSupport = createWorkflowBlockSupportData({
					blockConfigs,
					packageBlocks,
					blockRegistryError
				});
				const routeDataIdentity = createWorkflowRouteDataIdentity(snapshot.identity, {
					hasEditableDraft: Boolean(draftBranch)
				});
				workflowData = createWorkflowItemViewData({
					identity: workflowData?.identity ?? routeDataIdentity,
					slug,
					itemId,
					discoveredConfig,
					item,
					navigationManifest,
					blockSupport,
					contentError,
					cacheMiss: workflowData?.cacheMiss ?? null
				});

				logTiming('api.repo.item-view.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					slug,
					itemId,
					hasItem: item !== null,
					hasContentError: contentError !== null,
					blockConfigCount: blockConfigs.length,
					packageBlockCount: packageBlocks.length,
					hasNavigationManifest: navigationManifest.manifest !== null
				});

				return json({
					discoveredConfig,
					blockConfigs,
					packageBlocks,
					blockRegistryError,
					navigationManifest,
					item,
					contentError,
					workflowData,
					itemId,
					branch: draftBranch,
					pageSlug: slug,
					mode: 'github' as const
				});
			}
		);
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error(`Failed to load item view for ${slug}/${itemId}:`, err);
		throw error(500, 'Failed to load item view');
	}
};
