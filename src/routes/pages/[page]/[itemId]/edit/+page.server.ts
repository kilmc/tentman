import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { fetchContent } from '$lib/content/fetcher';
import { formatErrorMessage, logError } from '$lib/utils/errors';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
	// Auth check
	if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	const { owner, name } = locals.selectedRepo;

	// Get configs from cache
	const { getCachedConfigs } = await import('$lib/stores/config-cache');
	const configs = await getCachedConfigs(locals.octokit, owner, name);

	// Find config matching the slug
	const discoveredConfig = configs.find((c) => c.slug === params.page);

	if (!discoveredConfig) {
		throw error(404, 'Configuration not found');
	}

	try {

		// Only allow arrays and collections on this route
		if (discoveredConfig.type === 'singleton') {
			throw redirect(302, `/pages/${params.page}/edit`);
		}

		// Check if there's a draft branch - load from draft if it exists
		let branch: string | undefined;
		try {
			const { listPreviewBranches } = await import('$lib/github/branch');
			const branches = await listPreviewBranches(locals.octokit, owner, name);
			if (branches.length > 0) {
				branch = branches[0].name;
			}
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
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				discoveredConfig.path,
				params.page, // slug for cache key
				branch // Fetch from preview branch if it exists
			);

			// Find the specific item
			if (Array.isArray(content)) {
				// For arrays and collections, find the item by ID or filename
				const itemId = params.itemId;

				if (discoveredConfig.type === 'collection') {
					// For collections, itemId is the filename (without extension)
					item = content.find((i) => {
						const filenameWithoutExt = i._filename?.replace(/\.[^/.]+$/, '');
						return filenameWithoutExt === itemId;
					});
				} else {
					// For arrays, use the idField if configured
					if (discoveredConfig.config.idField) {
						item = content.find((i) => String(i[discoveredConfig.config.idField!]) === itemId);
					} else {
						// Fall back to index-based lookup
						const index = parseInt(itemId);
						if (!isNaN(index) && index >= 0 && index < content.length) {
							item = content[index];
						}
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

		return {
			discoveredConfig,
			item,
			contentError,
			itemId: params.itemId
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && (err.status === 404 || err.status === 302)) {
			throw err;
		}
		console.error('Failed to load config:', err);
		throw error(500, 'Failed to load configuration');
	}
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		// Require authentication and selected repo
		if (!locals.isAuthenticated || !locals.octokit) {
			return fail(401, { error: 'Not authenticated' });
		}

		if (!locals.selectedRepo) {
			return fail(400, { error: 'No repository selected' });
		}

		const { owner, name } = locals.selectedRepo;

		try {
			// Get configs from cache
			const { getCachedConfigs } = await import('$lib/stores/config-cache');
			const configs = await getCachedConfigs(locals.octokit, owner, name);
			const discoveredConfig = configs.find((c) => c.slug === params.page);

			if (!discoveredConfig) {
				return fail(404, { error: 'Configuration not found' });
			}

			const itemId = params.itemId;

			// Import deleteContent
			const { deleteContent } = await import('$lib/content/writer');

			// Delete the content - prepare options based on type
			let deleteOptions: any = {};

			if (discoveredConfig.type === 'collection') {
				// For collections, we need to fetch the item to get its filename
				const { getCachedContent } = await import('$lib/stores/content-cache');
				const content = await getCachedContent(
					locals.octokit,
					owner,
					name,
					discoveredConfig.config,
					discoveredConfig.type,
					discoveredConfig.path,
					params.page
				);

				if (Array.isArray(content)) {
					const item = content.find((i) => {
						const filenameWithoutExt = i._filename?.replace(/\.[^/.]+$/, '');
						return filenameWithoutExt === itemId;
					});

					if (item?._filename) {
						deleteOptions.filename = item._filename;
					}
				}
			} else {
				// For arrays, use the ID
				deleteOptions.itemId = itemId;
			}

			await deleteContent(
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
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
		// Require authentication and selected repo
		if (!locals.isAuthenticated || !locals.octokit) {
			return fail(401, { error: 'Not authenticated' });
		}

		if (!locals.selectedRepo) {
			return fail(400, { error: 'No repository selected' });
		}

		try {
			// Get configs from cache
			const { getCachedConfigs } = await import('$lib/stores/config-cache');
			const { owner, name } = locals.selectedRepo;
			const configs = await getCachedConfigs(locals.octokit, owner, name);
			const discoveredConfig = configs.find((c) => c.slug === params.page);

			if (!discoveredConfig) {
				return fail(404, { error: 'Configuration not found' });
			}

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);

			// Encode the data to pass via URL
			const encodedData = Buffer.from(JSON.stringify(contentData)).toString('base64url');

			// Build URL params
			const urlParams = new URLSearchParams({ data: encodedData });

			// For collections, include filename information
			if (discoveredConfig.type === 'collection') {
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
