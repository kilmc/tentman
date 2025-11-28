import type { Octokit } from 'octokit';
import { updateFile, generateCommitMessage } from './commit';

/**
 * Uploads an image file to a GitHub repository
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param file - File object from input[type="file"]
 * @param storagePath - Optional path prefix (defaults to 'static/images/')
 * @returns The path to the uploaded image (relative to repo root)
 */
export async function uploadImage(
	octokit: Octokit,
	owner: string,
	repo: string,
	file: File,
	storagePath: string = 'static/images/'
): Promise<string> {
	// Generate a unique filename to avoid conflicts
	const timestamp = Date.now();
	const randomSuffix = Math.random().toString(36).substring(2, 8);
	const extension = file.name.split('.').pop();
	const sanitizedName = file.name
		.replace(/\.[^/.]+$/, '') // Remove extension
		.replace(/[^a-z0-9]/gi, '-') // Replace non-alphanumeric with hyphens
		.toLowerCase();

	const filename = `${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
	const fullPath = `${storagePath}${filename}`;

	try {
		// Read file as base64
		const base64Content = await fileToBase64(file);

		// Upload to GitHub
		await octokit.rest.repos.createOrUpdateFileContents({
			owner,
			repo,
			path: fullPath,
			message: generateCommitMessage('create', 'image', filename),
			content: base64Content
		});

		// Return the path that can be used in content
		return `/${fullPath}`;
	} catch (err) {
		console.error('Failed to upload image:', err);
		throw new Error(`Failed to upload image: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
}

/**
 * Converts a File object to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				// Extract base64 content (remove data:image/...;base64, prefix)
				const base64 = reader.result.split(',')[1];
				resolve(base64);
			} else {
				reject(new Error('Failed to read file as base64'));
			}
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/**
 * Deletes an image from the repository
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param imagePath - Path to the image (e.g., '/static/images/photo.jpg')
 */
export async function deleteImage(
	octokit: Octokit,
	owner: string,
	repo: string,
	imagePath: string
): Promise<void> {
	// Remove leading slash if present
	const path = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;

	try {
		// Get the file's SHA (required for deletion)
		const { data: file } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path
		});

		if ('sha' in file) {
			await octokit.rest.repos.deleteFile({
				owner,
				repo,
				path,
				message: generateCommitMessage('delete', 'image', path.split('/').pop()),
				sha: file.sha
			});
		}
	} catch (err) {
		console.error('Failed to delete image:', err);
		throw new Error(`Failed to delete image: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
}
