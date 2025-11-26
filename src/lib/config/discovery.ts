/**
 * Config discovery utilities for Tentman CMS
 * Discovers and parses *.tentman.json files from GitHub repos
 */

import type { Octokit } from 'octokit';
import type { Config, ConfigType, DiscoveredConfig } from '$lib/types/config';
import { slugify } from '$lib/utils';

/**
 * Infers the config type based on its properties
 */
export function inferConfigType(config: Config): ConfigType {
	// Has template? → Multi-file collection
	if ('template' in config && config.template) {
		return 'collection';
	}

	// Has contentFile + collectionPath? → Single-file array
	if (
		'contentFile' in config &&
		config.contentFile &&
		'collectionPath' in config &&
		config.collectionPath
	) {
		return 'array';
	}

	// Has contentFile only? → Singleton
	if ('contentFile' in config && config.contentFile) {
		return 'singleton';
	}

	throw new Error('Unable to infer config type: invalid config structure');
}

/**
 * Discovers all *.tentman.json files in a repository using the Git Trees API
 */
export async function discoverConfigs(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<DiscoveredConfig[]> {
	try {
		// Get the default branch
		const { data: repoData } = await octokit.rest.repos.get({
			owner,
			repo
		});
		const defaultBranch = repoData.default_branch;

		// Get the tree recursively
		const { data: treeData } = await octokit.rest.git.getTree({
			owner,
			repo,
			tree_sha: defaultBranch,
			recursive: 'true'
		});

		// Filter for *.tentman.json files (exclude _*.tentman.json)
		const configPaths = treeData.tree
			.filter((item) => {
				if (item.type !== 'blob') return false;
				if (!item.path?.endsWith('.tentman.json')) return false;
				// Exclude files starting with underscore
				const filename = item.path.split('/').pop();
				if (filename?.startsWith('_')) return false;
				return true;
			})
			.map((item) => item.path!);

		// Fetch and parse each config file
		const configs = await Promise.all(
			configPaths.map(async (path) => {
				try {
					const { data: fileData } = await octokit.rest.repos.getContent({
						owner,
						repo,
						path
					});

					// Decode base64 content
					if ('content' in fileData && fileData.content) {
						const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
						const config = JSON.parse(content) as Config;

						// Infer type
						const type = inferConfigType(config);

						// Generate slug from label
						const slug = slugify(config.label);

						return {
							path,
							slug,
							config,
							type
						} as DiscoveredConfig;
					}

					return null;
				} catch (err) {
					console.error(`Failed to fetch/parse config at ${path}:`, err);
					return null;
				}
			})
		);

		// Filter out nulls and return
		return configs.filter((c): c is DiscoveredConfig => c !== null);
	} catch (err) {
		console.error('Failed to discover configs:', err);
		throw new Error('Failed to discover configuration files in repository');
	}
}
