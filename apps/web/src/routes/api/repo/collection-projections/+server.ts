// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { hydrateCollectionProjections } from '$lib/server/repository-data';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const body = (await request.json().catch(() => null)) as {
		slug?: unknown;
		blobShas?: unknown;
	} | null;
	const slug = typeof body?.slug === 'string' ? body.slug : null;
	const blobShas = Array.isArray(body?.blobShas)
		? body.blobShas.filter((value): value is string => typeof value === 'string')
		: [];

	if (!slug) {
		throw error(400, 'Missing collection slug');
	}

	try {
		return await timeAsync(
			'api.repo.collection-projections',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				slug,
				blobCount: blobShas.length
			},
			async () => {
				const { backend } = await requireGitHubContentRepository(
					{ locals, cookies },
					`/pages/${slug}`
				);
				const result = await hydrateCollectionProjections({ backend, slug, blobShas });

				if (!result) {
					throw error(404, 'Collection not found');
				}

				logTiming('api.repo.collection-projections.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					slug,
					requestedBlobCount: blobShas.length,
					itemCount: result.items.length
				});

				return json(result);
			}
		);
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`Failed to hydrate collection projections for ${slug}:`, err);
		throw error(500, 'Failed to hydrate collection projections');
	}
};
