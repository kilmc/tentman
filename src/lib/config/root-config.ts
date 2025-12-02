import type { Octokit } from 'octokit';

/**
 * Root-level configuration for a content repository.
 * Stored in .tentman.json at the repository root.
 */
export interface RootConfig {
	netlify?: {
		siteName: string;
	};
}

/**
 * Fetches the root configuration file (.tentman.json) from a repository.
 * This file contains site-wide settings like Netlify site name for preview URLs.
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Root configuration object or null if file doesn't exist
 */
export async function fetchRootConfig(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<RootConfig | null> {
	try {
		const { data } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: '.tentman.json'
		});

		// Ensure we got file content, not directory listing
		if ('content' in data && !Array.isArray(data)) {
			const content = Buffer.from(data.content, 'base64').toString('utf-8');
			return JSON.parse(content) as RootConfig;
		}

		return null;
	} catch (error) {
		// File doesn't exist or other error - return null
		// This is expected behavior - not all repos will have this config
		return null;
	}
}
