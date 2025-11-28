import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { discoverConfigs } from '$lib/config/discovery';
import { fetchContent } from '$lib/content/fetcher';
import { saveContent, createContent, deleteContent } from '$lib/content/writer';
import { formatErrorMessage, logError } from '$lib/utils/errors';

export const load: PageServerLoad = async ({ locals, params }) => {
	// Require authentication and selected repo
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	if (!locals.selectedRepo) {
		throw redirect(302, '/repos');
	}

	const { owner, name } = locals.selectedRepo;

	try {
		// Discover all configs to find the matching one
		const configs = await discoverConfigs(locals.octokit, owner, name);

		// Find config matching the slug
		const discoveredConfig = configs.find((c) => c.slug === params.page);

		if (!discoveredConfig) {
			throw error(404, 'Configuration not found');
		}

		// Fetch the actual content based on config type
		let content = null;
		let contentError = null;

		try {
			content = await fetchContent(
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				discoveredConfig.path
			);
		} catch (err) {
			logError(err, 'Fetch content');
			contentError = formatErrorMessage(err);
		}

		return {
			discoveredConfig,
			content,
			contentError,
			repo: locals.selectedRepo
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
	save: async ({ locals, params, request }) => {
		// Require authentication and selected repo
		if (!locals.isAuthenticated || !locals.octokit) {
			return fail(401, { error: 'Not authenticated' });
		}

		if (!locals.selectedRepo) {
			return fail(400, { error: 'No repository selected' });
		}

		const { owner, name } = locals.selectedRepo;

		try {
			// Get the config
			const configs = await discoverConfigs(locals.octokit, owner, name);
			const discoveredConfig = configs.find((c) => c.slug === params.page);

			if (!discoveredConfig) {
				return fail(404, { error: 'Configuration not found' });
			}

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);
			const itemIndex = formData.get('itemIndex');
			const itemId = formData.get('itemId');
			const filename = formData.get('filename');
			const newFilename = formData.get('newFilename');

			// Save the content
			await saveContent(
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				contentData,
				{
					itemIndex: itemIndex ? parseInt(itemIndex as string) : undefined,
					itemId: itemId ? (itemId as string) : undefined,
					filename: filename ? (filename as string) : undefined,
					newFilename: newFilename ? (newFilename as string) : undefined
				}
			);

			return { success: true };
		} catch (err) {
			logError(err, 'Save content');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	create: async ({ locals, params, request }) => {
		// Require authentication and selected repo
		if (!locals.isAuthenticated || !locals.octokit) {
			return fail(401, { error: 'Not authenticated' });
		}

		if (!locals.selectedRepo) {
			return fail(400, { error: 'No repository selected' });
		}

		const { owner, name } = locals.selectedRepo;

		try {
			// Get the config
			const configs = await discoverConfigs(locals.octokit, owner, name);
			const discoveredConfig = configs.find((c) => c.slug === params.page);

			if (!discoveredConfig) {
				return fail(404, { error: 'Configuration not found' });
			}

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);

			// Create the content
			await createContent(
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				contentData
			);

			return { success: true, created: true };
		} catch (err) {
			logError(err, 'Create content');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	delete: async ({ locals, params, request }) => {
		// Require authentication and selected repo
		if (!locals.isAuthenticated || !locals.octokit) {
			return fail(401, { error: 'Not authenticated' });
		}

		if (!locals.selectedRepo) {
			return fail(400, { error: 'No repository selected' });
		}

		const { owner, name } = locals.selectedRepo;

		try {
			// Get the config
			const configs = await discoverConfigs(locals.octokit, owner, name);
			const discoveredConfig = configs.find((c) => c.slug === params.page);

			if (!discoveredConfig) {
				return fail(404, { error: 'Configuration not found' });
			}

			// Parse form data
			const formData = await request.formData();
			const itemIndex = formData.get('itemIndex');
			const itemId = formData.get('itemId');
			const filename = formData.get('filename');

			// Delete the content
			await deleteContent(locals.octokit, owner, name, discoveredConfig.config, discoveredConfig.type, {
				itemIndex: itemIndex ? parseInt(itemIndex as string) : undefined,
				itemId: itemId ? (itemId as string) : undefined,
				filename: filename ? (filename as string) : undefined
			});

			return { success: true, deleted: true };
		} catch (err) {
			logError(err, 'Delete content');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
