// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { getCollectionIndex } from '$lib/server/repository-data';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing collection slug');
	}

	try {
		return await timeAsync(
			'api.repo.collection-index',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				slug
			},
			async () => {
				const { backend } = await requireGitHubContentRepository(
					{ locals, cookies },
					`/pages/${slug}`
				);
				const index = await getCollectionIndex({ backend, slug });

				if (!index) {
					throw error(404, 'Collection not found');
				}

				logTiming('api.repo.collection-index.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					slug,
					mode: index.mode,
					itemCount: index.items.length
				});

				return json({
					identity: index.identity,
					configSlug: index.configSlug,
					mode: index.mode,
					items: index.items
				});
			}
		);
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`Failed to load collection index for ${slug}:`, err);
		throw error(500, 'Failed to load collection index');
	}
};
