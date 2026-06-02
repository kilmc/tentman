// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import { logTiming, timeAsync } from '$lib/utils/performance-logging';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing page slug');
	}

	const requestContext = { locals, cookies };

	try {
		return await timeAsync(
			'api.repo.form-config',
			{
				repo: locals.selectedRepo?.full_name ?? null,
				slug
			},
			async () => {
				const {
					backend,
					configs,
					blockConfigs: cachedBlockConfigs,
					rootConfig,
					navigationManifest,
					draftBranch
				} = await loadSelectedGitHubRepoBootstrapContext(locals, cookies);
				const discoveredConfig = configs.find((config) => config.slug === slug);

				if (!discoveredConfig) {
					throw error(404, 'Configuration not found');
				}
				const { blockConfigs, packageBlocks, blockRegistryError } =
					await loadGitHubBlockRegistryData(backend, {
						blockConfigs: cachedBlockConfigs,
						rootConfig
					});

				logTiming('api.repo.form-config.result', {
					repo: locals.selectedRepo?.full_name ?? null,
					slug,
					configCount: configs.length,
					blockConfigCount: blockConfigs.length,
					packageBlockCount: packageBlocks.length
				});

				return json({
					discoveredConfig,
					blockConfigs,
					packageBlocks,
					blockRegistryError,
					navigationManifest,
					pageSlug: slug,
					branch: draftBranch,
					mode: 'github' as const
				});
			}
		);
	} catch (err) {
		handleGitHubSessionError(requestContext, err, {
			redirectTo: `/pages/${slug}/new`
		});

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error(`Failed to load form config for ${slug}:`, err);
		throw error(500, 'Failed to load form config');
	}
};
