import type { Octokit } from 'octokit';
import { parseRootConfig as parseRootConfigContent } from '$lib/config/parse';
import type { RootConfig } from '$lib/config/types';

export type { RootConfig };

export function parseRootConfig(content: string): RootConfig {
	return parseRootConfigContent(content);
}

export function shouldUseLocalConfigCache(rootConfig: RootConfig | null | undefined): boolean {
	return rootConfig?.debug?.cacheConfigs ?? true;
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
			return parseRootConfig(content);
		}

		return null;
	} catch (error) {
		// File doesn't exist or other error - return null
		// This is expected behavior - not all repos will have this config
		return null;
	}
}
