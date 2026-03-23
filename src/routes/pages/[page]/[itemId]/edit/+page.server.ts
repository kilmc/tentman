import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { deleteContentDocument } from '$lib/content/service';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { findContentItem } from '$lib/features/content-management/item';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { isLocalMode, requireDiscoveredConfig } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
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
		// Only allow collection content on this route
		if (!discoveredConfig.config.collection) {
			throw redirect(302, `/pages/${params.page}/edit`);
		}

		// Check if there's a draft branch - load from draft if it exists
		let branch: string | undefined;
		try {
			branch = await getLatestPreviewBranchName(octokit, owner, name);
		} catch (err) {
			console.error('Failed to check for draft branch:', err);
		}

		// Fetch the content (uses cache for speed)
		let content = null;
		let contentError = null;
		let item = null;

		try {
			const { getCachedContent } = await import('$lib/stores/content-cache');
			content = await getCachedContent(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				params.page, // slug for cache key
				branch // Fetch from preview branch if it exists
			);

			// Find the specific item
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

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				locals,
				params.page
			);

			const itemId = params.itemId;

			// Delete the content - prepare options based on type
			const deleteOptions: { itemId?: string; filename?: string } = {};

			if (discoveredConfig.config.content.mode === 'directory') {
				// Directory-backed collections need the stored filename to delete an entry
				const { getCachedContent } = await import('$lib/stores/content-cache');
				const content = await getCachedContent(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					params.page
				);

				if (Array.isArray(content)) {
					const item = findContentItem(content, discoveredConfig.config, itemId);

					if (item?._filename) {
						deleteOptions.filename = item._filename;
					}
				}
			} else {
				// File-backed collections delete by item ID
				deleteOptions.itemId = itemId;
			}

			await deleteContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				deleteOptions
			);

			// Redirect back to list view with success message
			throw redirect(303, `/pages/${params.page}?deleted=true`);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			logError(err, 'Delete content');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	saveToPreview: async ({ locals, params, request }) => {
		try {
			const { discoveredConfig } = await requireDiscoveredConfig(locals, params.page);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);

			// Encode the data to pass via URL
			const encodedData = Buffer.from(JSON.stringify(contentData)).toString('base64url');

			// Build URL params
			const urlParams = new URLSearchParams({ data: encodedData });

			// Directory-backed collections need filename information
			if (discoveredConfig.config.content.mode === 'directory') {
				const filename = formData.get('filename') as string;
				if (!filename) {
					return fail(400, {
						error: 'Filename is required for collection items. Please try reloading the page.'
					});
				}
				urlParams.set('filename', filename);
			}

			// Redirect to preview-changes page
			throw redirect(
				303,
				`/pages/${params.page}/${params.itemId}/preview-changes?${urlParams.toString()}`
			);
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
