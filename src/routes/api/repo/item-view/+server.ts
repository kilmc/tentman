// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findContentItem } from '$lib/features/content-management/item';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireDiscoveredConfig } from '$lib/server/page-context';
import { getCachedContent } from '$lib/stores/content-cache';
import { formatErrorMessage, logError } from '$lib/utils/errors';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	const itemId = url.searchParams.get('itemId');
	const branch = url.searchParams.get('branch') || undefined;

	if (!slug || !itemId) {
		throw error(400, 'Missing page or item identifier');
	}

	const requestContext = { locals, cookies };

	try {
		const { backend, discoveredConfig } = await requireDiscoveredConfig(
			requestContext,
			slug,
			`/pages/${slug}/${itemId}`
		);

		if (!discoveredConfig.config.collection) {
			return json({
				redirectTo: `/pages/${slug}/edit`
			});
		}

		let contentError = null;
		let item = null;

		try {
			const content = await getCachedContent(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				discoveredConfig.slug,
				branch
			);

			if (Array.isArray(content)) {
				item = findContentItem(content, discoveredConfig.config, itemId);

				if (!item && discoveredConfig.config.content.mode === 'file') {
					const index = Number.parseInt(itemId, 10);
					if (!Number.isNaN(index) && index >= 0 && index < content.length) {
						item = content[index];
					}
				}
			}

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
			await loadGitHubBlockRegistryData(backend);
		const navigationManifest = await loadNavigationManifestState(backend, { ref: branch });

		return json({
			discoveredConfig,
			blockConfigs,
			packageBlocks,
			blockRegistryError,
			navigationManifest,
			item,
			contentError,
			itemId,
			branch: branch ?? null,
			pageSlug: slug,
			mode: 'github' as const
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error(`Failed to load item view for ${slug}/${itemId}:`, err);
		throw error(500, 'Failed to load item view');
	}
};
