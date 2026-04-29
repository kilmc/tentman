// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { getCachedContent } from '$lib/stores/content-cache';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireDiscoveredConfig } from '$lib/server/page-context';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	const branch = url.searchParams.get('branch') || undefined;
	if (!slug) {
		throw error(400, 'Missing page slug');
	}

	const requestContext = { locals, cookies };

	try {
		const { backend, discoveredConfig } = await requireDiscoveredConfig(requestContext, slug, `/pages/${slug}`);

		let content = null;
		let contentError = null;

		try {
			content = await getCachedContent(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				discoveredConfig.slug,
				branch
			);
		} catch (err) {
			handleGitHubSessionError({ cookies }, err);
			logError(err, 'Fetch content');
			contentError = formatErrorMessage(err);
		}

		const { blockConfigs, packageBlocks, blockRegistryError } =
			await loadGitHubBlockRegistryData(backend);

		return json({
			discoveredConfig,
			blockConfigs,
			packageBlocks,
			blockRegistryError,
			content,
			contentError,
			branch: branch ?? null,
			pageSlug: slug,
			mode: 'github' as const
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error(`Failed to load page view for ${slug}:`, err);
		throw error(500, 'Failed to load page view');
	}
};
