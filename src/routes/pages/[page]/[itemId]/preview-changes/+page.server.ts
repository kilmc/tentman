import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	createContentDocument,
	previewContentChanges,
	saveContentDocument
} from '$lib/content/service.js';
import { formatErrorMessage, logError } from '$lib/utils/errors.js';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { isLocalMode, requireDiscoveredConfig } from '$lib/server/page-context';
import type { ContentRecord } from '$lib/features/content-management/types';

function getExistingItemMutationOptions(
	contentMode: 'file' | 'directory',
	itemId: string,
	filename?: string,
	newFilename?: string
) {
	if (contentMode === 'directory') {
		if (!filename) {
			return null;
		}

		return {
			filename,
			...(newFilename && newFilename !== filename ? { newFilename } : {})
		};
	}

	return { itemId };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (isLocalMode(locals)) {
		throw redirect(
			302,
			url.searchParams.get('new') === 'true'
				? `/pages/${params.page}/new`
				: `/pages/${params.page}/${params.itemId}/edit`
		);
	}

	const { backend, owner, name, discoveredConfig } = await requireDiscoveredConfig(
		locals,
		params.page
	);

	// Only allow collection content on this route
	if (!discoveredConfig.config.collection) {
		throw redirect(302, `/pages/${params.page}/edit`);
	}

	// Get form data from URL params (passed from edit form)
	const encodedData = url.searchParams.get('data');
	const isNew = url.searchParams.get('new') === 'true';
	const filename = url.searchParams.get('filename') || undefined;
	const newFilename = url.searchParams.get('newFilename') || undefined;

	if (!encodedData) {
		throw redirect(302, `/pages/${params.page}/${params.itemId}/edit`);
	}

	let contentData: ContentRecord;
	try {
		contentData = JSON.parse(Buffer.from(encodedData, 'base64url').toString());
	} catch (err) {
		logError(err, 'Parse preview data');
		throw error(400, 'Invalid preview data');
	}

	// Calculate what changes will be made
	// Note: We calculate against main branch for the preview
	let changesSummary = null;
	let changesError = null;
	const existingItemOptions = !isNew
		? getExistingItemMutationOptions(
				discoveredConfig.config.content.mode,
				params.itemId,
				filename,
				newFilename
			)
		: null;

	try {
		changesSummary = await previewContentChanges(
			backend,
			discoveredConfig.config,
			discoveredConfig.path,
			contentData,
			{
				isNew,
				...(isNew ? { newFilename } : (existingItemOptions ?? {})),
				branch: undefined // Preview against main branch
			}
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
		itemId: params.itemId,
		isNew,
		filename,
		newFilename,
		repo: { owner, name }
	};
};

export const actions: Actions = {
	createPreview: async ({ locals, params, request, cookies }) => {
		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				locals,
				params.page
			);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const isNew = formData.get('isNew') === 'true';
			const filename = (formData.get('filename') as string) || undefined;
			const newFilename = (formData.get('newFilename') as string) || undefined;

			// Get or create draft branch
			const formBranchName = formData.get('branchName') as string | null;
			const { branchName, created } = await ensureDraftBranch(octokit, owner, name, formBranchName);
			if (created) {
				console.log(`✅ Created draft branch: ${branchName}`);
			}

			// Save or create the content to the draft branch
			if (isNew) {
				await createContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					contentData,
					{
						filename: newFilename,
						branch: branchName
					}
				);
			} else {
				const existingItemOptions = getExistingItemMutationOptions(
					discoveredConfig.config.content.mode,
					params.itemId,
					filename,
					newFilename
				);

				if (!existingItemOptions) {
					return fail(400, {
						error: 'Filename is required for directory-backed content.'
					});
				}

				const saveOptions = {
					branch: branchName,
					...existingItemOptions
				};

				await saveContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					contentData,
					saveOptions
				);
			}

			console.log(`✅ Saved content to ${branchName}`);

			// Redirect back to index page
			throw redirect(
				303,
				`/pages/${params.page}?saved=true&branch=${encodeURIComponent(branchName)}`
			);
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
		try {
			const { backend, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				locals,
				params.page
			);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const isNew = formData.get('isNew') === 'true';
			const filename = (formData.get('filename') as string) || undefined;
			const newFilename = (formData.get('newFilename') as string) || undefined;

			// Save or create the content directly to main branch
			if (isNew) {
				await createContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					contentData,
					{
						filename: newFilename
						// No branch = commits to default branch
					}
				);
			} else {
				const saveOptions = getExistingItemMutationOptions(
					discoveredConfig.config.content.mode,
					params.itemId,
					filename,
					newFilename
				);

				if (!saveOptions) {
					return fail(400, {
						error: 'Filename is required for directory-backed content.'
					});
				}

				await saveContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					contentData,
					saveOptions
				);
			}

			// Redirect to list view with success message
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
