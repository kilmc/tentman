import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { isLocalMode, requireDiscoveredConfig } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (isLocalMode(locals)) {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			content: null,
			contentError: null,
			blockRegistryError: null,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
		locals,
		params.page
	);

	try {
		// Only allow single-entry content on this route
		if (discoveredConfig.config.collection) {
			throw redirect(302, `/pages/${params.page}`);
		}

		// Fetch the actual content (uses cache for speed)
		let content = null;
		let contentError = null;

		// Check if there's a draft branch - load from draft if it exists
		let branch: string | undefined;
		try {
			branch = await getLatestPreviewBranchName(octokit, owner, name);
		} catch (err) {
			console.error('Failed to check for draft branch:', err);
		}

		try {
			const { getCachedContent } = await import('$lib/stores/content-cache');
			content = await getCachedContent(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				params.page, // slug for cache key
				branch // Fetch from preview branch if it exists
			);
		} catch (err) {
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
			content,
			contentError,
			pageSlug: params.page,
			mode: 'github' as const
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}
		console.error('Failed to load config:', err);
		throw error(500, 'Failed to load configuration');
	}
};

export const actions: Actions = {
	saveToPreview: async ({ locals, params, request }) => {
		try {
			await requireDiscoveredConfig(locals, params.page);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);

			// Encode the data to pass via URL
			const encodedData = Buffer.from(JSON.stringify(contentData)).toString('base64url');

			// Redirect to preview-changes page
			throw redirect(303, `/pages/${params.page}/preview-changes?data=${encodedData}`);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			logError(err, 'Prepare preview');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
