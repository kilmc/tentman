import type { Octokit } from 'octokit';
import { discoverGitHubBlockConfigs, discoverGitHubConfigs } from '$lib/config/discovery';
import { parseRootConfig, type RootConfig } from '$lib/config/root-config';
import type {
	RepoEntry,
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

export interface GitHubRepositoryIdentity {
	owner: string;
	name: string;
	full_name: string;
}

export interface GitHubRepositoryBackend extends RepositoryBackend {
	kind: 'github';
	owner: string;
	repo: string;
	fullName: string;
	octokit: Octokit;
}

function decodeGitHubContent(content: string): string {
	return Buffer.from(content, 'base64').toString('utf-8');
}

export function createGitHubRepositoryBackend(
	octokit: Octokit,
	repository: GitHubRepositoryIdentity
): GitHubRepositoryBackend {
	const { owner, name, full_name } = repository;

	return {
		kind: 'github',
		cacheKey: `github:${owner}/${name}`,
		label: full_name,
		supportsDraftBranches: true,
		owner,
		repo: name,
		fullName: full_name,
		octokit,

		discoverConfigs() {
			return discoverGitHubConfigs(octokit, owner, name);
		},

		discoverBlockConfigs() {
			return discoverGitHubBlockConfigs(octokit, owner, name);
		},

		async readRootConfig(): Promise<RootConfig | null> {
			try {
				const { data } = await octokit.rest.repos.getContent({
					owner,
					repo: name,
					path: '.tentman.json'
				});

				if (!('content' in data) || Array.isArray(data)) {
					return null;
				}

				return parseRootConfig(decodeGitHubContent(data.content));
			} catch {
				return null;
			}
		},

		async readTextFile(path: string, options?: RepositoryReadOptions): Promise<string> {
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo: name,
				path,
				...(options?.ref && { ref: options.ref })
			});

			if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
				throw new Error(`Expected file at ${path}`);
			}

			return decodeGitHubContent(data.content);
		},

		async writeTextFile(
			path: string,
			content: string,
			options?: RepositoryWriteOptions
		): Promise<void> {
			let sha: string | undefined;

			try {
				const { data } = await octokit.rest.repos.getContent({
					owner,
					repo: name,
					path,
					...(options?.ref && { ref: options.ref })
				});

				if ('sha' in data) {
					sha = data.sha;
				}
			} catch {
				// Create if missing.
			}

			await octokit.rest.repos.createOrUpdateFileContents({
				owner,
				repo: name,
				path,
				message: options?.message || `Update ${path} via Tentman CMS`,
				content: Buffer.from(content).toString('base64'),
				...(sha && { sha }),
				...(options?.ref && { branch: options.ref })
			});
		},

		async deleteFile(path: string, options?: RepositoryWriteOptions): Promise<void> {
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo: name,
				path,
				...(options?.ref && { ref: options.ref })
			});

			if (!('sha' in data)) {
				throw new Error(`Expected file at ${path}`);
			}

			await octokit.rest.repos.deleteFile({
				owner,
				repo: name,
				path,
				message: options?.message || `Delete ${path} via Tentman CMS`,
				sha: data.sha,
				...(options?.ref && { branch: options.ref })
			});
		},

		async listDirectory(path: string, options?: RepositoryReadOptions): Promise<RepoEntry[]> {
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo: name,
				path: path || '.',
				...(options?.ref && { ref: options.ref })
			});

			if (!Array.isArray(data)) {
				throw new Error(`Expected directory at ${path || '.'}`);
			}

			return data
				.filter((entry) => entry.type === 'file' || entry.type === 'dir')
				.map((entry) => ({
					name: entry.name,
					path: entry.path,
					kind: entry.type === 'dir' ? 'directory' : 'file'
				}));
		},

		async fileExists(path: string, options?: RepositoryReadOptions): Promise<boolean> {
			try {
				await octokit.rest.repos.getContent({
					owner,
					repo: name,
					path,
					...(options?.ref && { ref: options.ref })
				});
				return true;
			} catch (error) {
				if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
					return false;
				}

				throw error;
			}
		}
	};
}
