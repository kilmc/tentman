// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { getRepositorySnapshot } from '$lib/server/repository-data';
import { resolvePageViewContentForRoute } from '$lib/server/repository-data/route-fallbacks';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing page slug');
	}

	const requestContext = { locals, cookies };

	try {
		return await timeAsync(
			'api.repo.page-view',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				slug
			},
			async () => {
				const { backend, draftBranch } = await requireGitHubContentRepository(
					requestContext,
					`/pages/${slug}`
				);
				const snapshot = await getRepositorySnapshot({ backend });
				const discoveredConfig = snapshot.configIndex.bySlug.get(slug);

				if (!discoveredConfig) {
					throw error(404, 'Configuration not found');
				}

				let content = null;
				let contentError = null;
				let collectionNavigation = null;
				let contentSource = null;

				try {
					const resolvedContent = await resolvePageViewContentForRoute({
						backend,
						discoveredConfig
					});
					content = resolvedContent.content;
					collectionNavigation = resolvedContent.collectionNavigation;
					contentSource = resolvedContent.source;
				} catch (err) {
					handleGitHubSessionError({ cookies }, err);
					logError(err, 'Fetch content');
					contentError = formatErrorMessage(err);
				}

				const { blockConfigs, packageBlocks, blockRegistryError } =
					await loadGitHubBlockRegistryData(backend);

				logTiming('api.repo.page-view.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					slug,
					hasContent: content !== null,
					hasCollectionNavigation: collectionNavigation !== null,
					contentSource,
					hasContentError: contentError !== null,
					blockConfigCount: blockConfigs.length,
					packageBlockCount: packageBlocks.length
				});

				return json({
					discoveredConfig,
					blockConfigs,
					packageBlocks,
					blockRegistryError,
					content,
					collectionNavigation,
					contentError,
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

		console.error(`Failed to load page view for ${slug}:`, err);
		throw error(500, 'Failed to load page view');
	}
};
