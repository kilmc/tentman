import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';

export const load: PageServerLoad = async ({ locals, params }) => {
	// Auth check
	if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	const { owner, name } = locals.selectedRepo;

	// Get configs from cache (no parent() call to avoid double load)
	const { getCachedConfigs } = await import('$lib/stores/config-cache');
	const configs = await getCachedConfigs(locals.octokit, owner, name);

	// Find config matching the slug
	const discoveredConfig = configs.find((c) => c.slug === params.page);

	if (!discoveredConfig) {
		throw error(404, 'Configuration not found');
	}

	try {

		// Only allow singletons on this route
		if (discoveredConfig.type !== 'singleton') {
			throw redirect(302, `/pages/${params.page}`);
		}

		// Fetch the actual content (uses cache for speed)
		let content = null;
		let contentError = null;

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
		} catch (err) {
			logError(err, 'Fetch content');
			contentError = formatErrorMessage(err);
		}

		return {
			discoveredConfig,
			content,
			contentError
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
