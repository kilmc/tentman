import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { calculateChanges } from '$lib/utils/preview.js';
import { saveContent } from '$lib/content/writer.js';
import { formatErrorMessage, logError } from '$lib/utils/errors.js';
import { createBranch, branchExists } from '$lib/github/branch.js';

export const load: PageServerLoad = async ({ locals, params, url }) => {
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

	// Only allow singletons on this route
	if (discoveredConfig.type !== 'singleton') {
		throw redirect(302, `/pages/${params.page}`);
	}

	// Get form data from URL params (passed from edit form)
	const encodedData = url.searchParams.get('data');
	if (!encodedData) {
		throw redirect(302, `/pages/${params.page}/edit`);
	}

	let contentData: Record<string, any>;
	try {
		contentData = JSON.parse(Buffer.from(encodedData, 'base64url').toString());
	} catch (err) {
		logError(err, 'Parse preview data');
		throw error(400, 'Invalid preview data');
	}

	// Calculate what changes will be made
	let changesSummary = null;
	let changesError = null;

	try {
		changesSummary = await calculateChanges(
			locals.octokit,
			owner,
			name,
			discoveredConfig.config,
			discoveredConfig.type,
			discoveredConfig.path,
			contentData
		);
	} catch (err) {
		logError(err, 'Calculate changes');
		changesError = formatErrorMessage(err);
	}

	return {
		discoveredConfig,
		contentData,
		changesSummary,
		changesError,
		repo: { owner, name }
	};
};

export const actions: Actions = {
	createPreview: async ({ locals, params, request, cookies }) => {
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

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);

			// Get or create draft branch
			const formBranchName = formData.get('branchName') as string | null;
			let branchName: string;
			let needsNewBranch = false;

			if (formBranchName) {
				// Use existing draft branch from client
				branchName = formBranchName;

				// Verify it still exists
				const exists = await branchExists(locals.octokit, owner, name, branchName);
				if (!exists) {
					needsNewBranch = true;
				}
			} else {
				// Create new draft branch with today's date
				const today = new Date();
				const yyyy = today.getFullYear();
				const mm = String(today.getMonth() + 1).padStart(2, '0');
				const dd = String(today.getDate()).padStart(2, '0');
				const baseName = `preview-${yyyy}-${mm}-${dd}`;

				// Check if branch already exists, append sequence number if needed
				branchName = baseName;
				let sequence = 2;

				while (await branchExists(locals.octokit, owner, name, branchName)) {
					branchName = `${baseName}-${sequence}`;
					sequence++;
				}

				needsNewBranch = true;
			}

			// Create the branch if needed
			if (needsNewBranch) {
				await createBranch(locals.octokit, owner, name, branchName);
				console.log(`✅ Created draft branch: ${branchName}`);
			}

			// Save the content to the draft branch
			await saveContent(
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				discoveredConfig.path,
				contentData,
				{
					branch: branchName
				}
			);

			console.log(`✅ Saved content to ${branchName}`);

			// Redirect back to index page
			throw redirect(303, `/pages/${params.page}?saved=true&branch=${encodeURIComponent(branchName)}`);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			logError(err, 'Create draft');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	publishNow: async ({ locals, params, request }) => {
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

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);

			// Save the content directly to main branch (no branch specified = default branch)
			await saveContent(
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				discoveredConfig.path,
				contentData
				// No branch option = commits to default branch
			);

			// Redirect to index with success message
			throw redirect(303, `/pages/${params.page}?published=true`);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			// Check for protected branch error
			if (
				err &&
				typeof err === 'object' &&
				'status' in err &&
				err.status === 403 &&
				'message' in err &&
				typeof err.message === 'string' &&
				err.message.toLowerCase().includes('protected')
			) {
				return fail(403, {
					error:
						'Cannot publish directly to main branch. The main branch is protected. Please use "Save to Draft" instead to create a draft, then merge via pull request.'
				});
			}

			logError(err, 'Publish now');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
