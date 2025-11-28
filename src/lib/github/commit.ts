import type { Octokit } from 'octokit';

/**
 * Updates a file in a GitHub repository by creating a new commit
 */
export async function updateFile(
	octokit: Octokit,
	owner: string,
	repo: string,
	path: string,
	content: string,
	message: string
): Promise<void> {
	try {
		// Get the current file to retrieve its SHA (required for updates)
		let sha: string | undefined;
		try {
			const { data: currentFile } = await octokit.rest.repos.getContent({
				owner,
				repo,
				path
			});

			if ('sha' in currentFile) {
				sha = currentFile.sha;
			}
		} catch (err) {
			// File doesn't exist yet, which is fine for new files
			// SHA will be undefined and GitHub will create a new file
		}

		// Update or create the file
		await octokit.rest.repos.createOrUpdateFileContents({
			owner,
			repo,
			path,
			message,
			content: Buffer.from(content).toString('base64'),
			sha
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to update file:', { path, error: err });
		throw new Error(`Failed to update ${path}: ${errorMessage}`);
	}
}

/**
 * Generates a commit message for content updates
 */
export function generateCommitMessage(
	action: 'update' | 'create' | 'delete',
	contentType: string,
	identifier?: string
): string {
	const messages = {
		update: identifier ? `Update ${contentType}: ${identifier}` : `Update ${contentType}`,
		create: identifier ? `Create ${contentType}: ${identifier}` : `Create ${contentType}`,
		delete: identifier ? `Delete ${contentType}: ${identifier}` : `Delete ${contentType}`
	};

	return `${messages[action]} via Tentman CMS`;
}
