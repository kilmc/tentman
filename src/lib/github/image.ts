import type { Octokit } from 'octokit';
import { generateCommitMessage } from './commit';

interface WriteGitHubImageOptions {
	path: string;
	branch?: string;
	message?: string;
}

export async function writeGitHubImage(
	octokit: Octokit,
	owner: string,
	repo: string,
	content: Uint8Array,
	options: WriteGitHubImageOptions
): Promise<void> {
	let sha: string | undefined;

	try {
		const { data } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: options.path,
			...(options.branch && { ref: options.branch })
		});

		if (!Array.isArray(data) && 'sha' in data) {
			sha = data.sha;
		}
	} catch {
		// Missing files should be created.
	}

	await octokit.rest.repos.createOrUpdateFileContents({
		owner,
		repo,
		path: options.path,
		message:
			options.message || generateCommitMessage('create', 'image', options.path.split('/').pop()),
		content: Buffer.from(content).toString('base64'),
		...(sha && { sha }),
		...(options.branch && { branch: options.branch })
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
		throw new Error(
			`Failed to delete image: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}
