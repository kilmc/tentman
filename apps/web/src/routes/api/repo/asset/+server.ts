// SERVER_JUSTIFICATION: github_proxy
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { isDraftAssetRef } from '$lib/features/draft-assets/shared';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import { getAssetContentType, resolveGitHubAssetPathDetailed } from '$lib/server/repo-asset-proxy';
import { isAbsoluteAssetUrl } from '$lib/utils/assets';

type AssetRepositoryContext = {
	owner: string;
	name: string;
	fullName: string;
	defaultBranch: string;
};

async function readGitHubAssetFile(input: {
	octokit: ReturnType<typeof createGitHubServerClient>;
	owner: string;
	repo: string;
	path: string;
	ref: string;
}): Promise<Uint8Array> {
	const { data } = await input.octokit.rest.repos.getContent({
		owner: input.owner,
		repo: input.repo,
		path: input.path,
		ref: input.ref
	});

	if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
		throw error(404, 'Asset not found');
	}

	if (data.content && (!data.encoding || data.encoding === 'base64')) {
		return Buffer.from(data.content, 'base64');
	}

	const { data: blob } = await input.octokit.rest.git.getBlob({
		owner: input.owner,
		repo: input.repo,
		file_sha: data.sha
	});

	return Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf-8');
}

function getAssetRepositoryContext(
	url: URL,
	selectedRepo: App.Locals['selectedRepo']
): AssetRepositoryContext | null {
	const owner = url.searchParams.get('owner')?.trim();
	const name = url.searchParams.get('repo')?.trim();
	const branch = url.searchParams.get('branch')?.trim();

	if (owner && name) {
		const selectedRepoMatches = selectedRepo?.owner === owner && selectedRepo.name === name;
		const defaultBranch = branch || (selectedRepoMatches ? selectedRepo.default_branch : null);

		if (!defaultBranch) {
			throw error(400, 'Missing repository branch');
		}

		return {
			owner,
			name,
			fullName: `${owner}/${name}`,
			defaultBranch
		};
	}

	if (!owner && !name && selectedRepo) {
		return {
			owner: selectedRepo.owner,
			name: selectedRepo.name,
			fullName: selectedRepo.full_name,
			defaultBranch: selectedRepo.default_branch
		};
	}

	return null;
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const value = url.searchParams.get('value');
	if (!value) {
		throw error(400, 'Missing asset value');
	}

	if (isDraftAssetRef(value) || isAbsoluteAssetUrl(value)) {
		throw error(400, 'Unsupported asset value');
	}

	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'GitHub session required');
	}

	const repository = getAssetRepositoryContext(url, locals.selectedRepo);
	if (!repository) {
		throw error(400, 'Missing repository context');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);

	try {
		const assetsDir = url.searchParams.get('assetsDir');
		if (assetsDir) {
			throw error(400, 'Legacy asset mapping is not supported');
		}

		const configuredAssetPath = url.searchParams.get('assetPath')?.trim();
		const publicPath = url.searchParams.get('publicPath')?.trim();
		if (!configuredAssetPath || !publicPath) {
			throw error(400, 'Missing asset mapping');
		}

		const assetPathResolution = resolveGitHubAssetPathDetailed({
			value,
			assetPath: configuredAssetPath,
			publicPath
		});

		if (!assetPathResolution.ok) {
			console.warn('Rejected GitHub-backed asset request:', {
				reason: assetPathResolution.reason,
				value,
				assetPath: configuredAssetPath,
				publicPath,
				repository: repository.fullName
			});
			throw error(400, `Invalid asset path: ${assetPathResolution.message}`);
		}

		const assetPath = assetPathResolution.path;
		const draftBranch =
			(await getTentmanDraftBranchName(octokit, repository.owner, repository.name)) ?? null;
		let bytes: Uint8Array | null = null;

		if (draftBranch) {
			try {
				bytes = await readGitHubAssetFile({
					octokit,
					owner: repository.owner,
					repo: repository.name,
					path: assetPath,
					ref: draftBranch
				});
			} catch (err) {
				if (!err || typeof err !== 'object' || !('status' in err) || err.status !== 404) {
					throw err;
				}
			}
		}

		if (!bytes) {
			bytes = await readGitHubAssetFile({
				octokit,
				owner: repository.owner,
				repo: repository.name,
				path: assetPath,
				ref: repository.defaultBranch
			});
		}

		const body: ArrayBuffer = Uint8Array.from(bytes).buffer;

		return new Response(body, {
			headers: {
				'content-type': getAssetContentType(assetPath),
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to load GitHub-backed asset:', err);
		throw error(500, 'Failed to load asset');
	}
};
