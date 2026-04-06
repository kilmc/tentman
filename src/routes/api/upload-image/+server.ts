// SERVER_JUSTIFICATION: image_upload
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadImage } from '$lib/github/image';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	// Require authentication
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const { owner, name } = locals.selectedRepo;
	const octokit = createGitHubServerClient(locals.githubToken, cookies);

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const storagePath = (formData.get('storagePath') as string) || 'static/images/';

		if (!file) {
			throw error(400, 'No file provided');
		}

		// Validate file type
		if (!file.type.startsWith('image/')) {
			throw error(400, 'File must be an image');
		}

		// Validate file size (max 5MB)
		const maxSize = 5 * 1024 * 1024; // 5MB
		if (file.size > maxSize) {
			throw error(400, 'File size must be less than 5MB');
		}

		// Upload the image
		const imagePath = await uploadImage(octokit, owner, name, file, storagePath);

		return json({ success: true, path: imagePath });
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);
		console.error('Image upload failed:', err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		throw error(500, err instanceof Error ? err.message : 'Failed to upload image');
	}
};
