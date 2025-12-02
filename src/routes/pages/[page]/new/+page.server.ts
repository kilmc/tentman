import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';

export const load: PageServerLoad = async ({ locals, params }) => {
	// Auth check
	if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	// Get configs from cache
	const { getCachedConfigs } = await import('$lib/stores/config-cache');
	const configs = await getCachedConfigs(locals.octokit, locals.selectedRepo.owner, locals.selectedRepo.name);

	// Find config matching the slug
	const discoveredConfig = configs.find((c) => c.slug === params.page);

	if (!discoveredConfig) {
		throw error(404, 'Configuration not found');
	}

	try {

		// Only allow arrays and collections on this route
		if (discoveredConfig.type === 'singleton') {
			throw redirect(302, `/pages/${params.page}`);
		}

		return {
			discoveredConfig
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
	createToPreview: async ({ locals, params, request }) => {
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

			// Generate an itemId for the URL (use idField if available, or "new")
			const itemId =
				discoveredConfig.config.idField && contentData[discoveredConfig.config.idField]
					? contentData[discoveredConfig.config.idField]
					: 'new';

			// Encode the data to pass via URL
			const encodedData = Buffer.from(JSON.stringify(contentData)).toString('base64url');

			// Build URL params
			const urlParams = new URLSearchParams({
				data: encodedData,
				new: 'true'
			});

			// For collections, include the filename
			if (discoveredConfig.type === 'collection') {
				const newFilename = formData.get('newFilename') as string;
				if (!newFilename) {
					return fail(400, {
						error: 'Filename is required for collection items'
					});
				}
				urlParams.set('newFilename', newFilename.trim());
			}

			// Redirect to preview-changes page
			throw redirect(303, `/pages/${params.page}/${itemId}/preview-changes?${urlParams.toString()}`);
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
