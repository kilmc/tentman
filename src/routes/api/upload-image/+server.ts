import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadImage } from '$lib/github/image';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Require authentication
	if (!locals.isAuthenticated || !locals.octokit) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const { owner, name } = locals.selectedRepo;

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
		const imagePath = await uploadImage(locals.octokit, owner, name, file, storagePath);

		return json({ success: true, path: imagePath });
	} catch (err) {
		console.error('Image upload failed:', err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		throw error(500, err instanceof Error ? err.message : 'Failed to upload image');
	}
};
