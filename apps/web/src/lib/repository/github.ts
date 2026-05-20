import type { Octokit } from 'octokit';
import { discoverGitHubBlockConfigs, discoverGitHubConfigs } from '$lib/config/discovery';
import { parseRootConfig, type RootConfig } from '$lib/config/root-config';
import { writeGitHubImage } from '$lib/github/image';
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
	repository: GitHubRepositoryIdentity,
	options?: {
		defaultRef?: string;
	}
): GitHubRepositoryBackend {
	const { owner, name, full_name } = repository;
	const defaultRef = options?.defaultRef;

	function readRef(options?: RepositoryReadOptions): string | undefined {
		return options?.ref ?? defaultRef;
	}

	return {
		kind: 'github',
		cacheKey: defaultRef ? `github:${owner}/${name}?ref=${defaultRef}` : `github:${owner}/${name}`,
		label: full_name,
		supportsDraftBranches: true,
		owner,
		repo: name,
		fullName: full_name,
		octokit,

		discoverConfigs() {
			return discoverGitHubConfigs(octokit, owner, name, defaultRef);
		},

		discoverBlockConfigs() {
			return discoverGitHubBlockConfigs(octokit, owner, name, defaultRef);
		},

		async readRootConfig(): Promise<RootConfig | null> {
			try {
				const { data } = await octokit.rest.repos.getContent({
					owner,
					repo: name,
					path: '.tentman.json',
					...(defaultRef ? { ref: defaultRef } : {})
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
			const ref = readRef(options);
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo: name,
				path,
				...(ref && { ref })
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
			const ref = readRef(options);

			try {
				const { data } = await octokit.rest.repos.getContent({
					owner,
					repo: name,
					path,
					...(ref && { ref })
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
				...(ref && { branch: ref })
			});
		},

		async writeBinaryFile(
			path: string,
			content: Uint8Array,
			options?: RepositoryWriteOptions
		): Promise<void> {
			const ref = readRef(options);
			await writeGitHubImage(octokit, owner, name, content, {
				path,
				branch: ref,
				message: options?.message
			});
		},

		async deleteFile(path: string, options?: RepositoryWriteOptions): Promise<void> {
			const ref = readRef(options);
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo: name,
				path,
				...(ref && { ref })
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
				...(ref && { branch: ref })
			});
		},

		async listDirectory(path: string, options?: RepositoryReadOptions): Promise<RepoEntry[]> {
			const ref = readRef(options);
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo: name,
				path: path || '.',
				...(ref && { ref })
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
			const ref = readRef(options);
			try {
				await octokit.rest.repos.getContent({
					owner,
					repo: name,
					path,
					...(ref && { ref })
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
