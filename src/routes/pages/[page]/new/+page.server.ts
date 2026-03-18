import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { isLocalMode, requireDiscoveredConfig } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (isLocalMode(locals)) {
		return {
			discoveredConfig: null,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	const { discoveredConfig } = await requireDiscoveredConfig(locals, params.page);

	try {

		// Only allow arrays and collections on this route
		if (discoveredConfig.type === 'singleton') {
			throw redirect(302, `/pages/${params.page}`);
		}

		return {
			discoveredConfig,
			pageSlug: params.page,
			mode: 'github' as const
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
		try {
			const { discoveredConfig } = await requireDiscoveredConfig(locals, params.page);

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
