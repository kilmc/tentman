import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { findContentItem } from '$lib/features/content-management/item';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { isLocalMode, requireDiscoveredConfig } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (isLocalMode(locals)) {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			item: null,
			contentError: null,
			blockRegistryError: null,
			itemId: params.itemId,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
		locals,
		params.page
	);

	try {
		if (!discoveredConfig.config.collection) {
			throw redirect(302, `/pages/${params.page}/edit`);
		}

		let branch: string | undefined;
		try {
			branch = await getLatestPreviewBranchName(octokit, owner, name);
		} catch (err) {
			console.error('Failed to check for draft branch:', err);
		}

		let contentError = null;
		let item = null;

		try {
			const { getCachedContent } = await import('$lib/stores/content-cache');
			const content = await getCachedContent(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				params.page,
				branch
			);

			if (Array.isArray(content)) {
				item = findContentItem(content, discoveredConfig.config, params.itemId);

				if (!item && discoveredConfig.config.content.mode === 'file') {
					const index = Number.parseInt(params.itemId, 10);
					if (!Number.isNaN(index) && index >= 0 && index < content.length) {
						item = content[index];
					}
				}

				if (!item) {
					throw error(404, 'Item not found');
				}
			}
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
				throw err;
			}

			logError(err, 'Fetch content');
			contentError = formatErrorMessage(err);
		}

		const { blockConfigs, packageBlocks, blockRegistryError } =
			await loadGitHubBlockRegistryData(backend);

		return {
			discoveredConfig,
			blockConfigs,
			packageBlocks,
			blockRegistryError,
			item,
			contentError,
			itemId: params.itemId,
			pageSlug: params.page,
			mode: 'github' as const
		};
	} catch (err) {
		if (
			err &&
			typeof err === 'object' &&
			'status' in err &&
			(err.status === 404 || err.status === 302)
		) {
			throw err;
		}

		console.error('Failed to load config:', err);
		throw error(500, 'Failed to load configuration');
	}
};
