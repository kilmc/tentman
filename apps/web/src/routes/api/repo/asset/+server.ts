// SERVER_JUSTIFICATION: github_proxy
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { isDraftAssetRef } from '$lib/features/draft-assets/shared';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { getAssetContentType, resolveGitHubAssetPath } from '$lib/server/repo-asset-proxy';
import { requireGitHubRepository } from '$lib/server/page-context';
import { isAbsoluteAssetUrl } from '$lib/utils/assets';

async function readGitHubAssetFile(input: {
	octokit: ReturnType<typeof requireGitHubRepository>['octokit'];
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

	return Buffer.from(data.content, 'base64');
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const value = url.searchParams.get('value');
	if (!value) {
		throw error(400, 'Missing asset value');
	}

	if (isDraftAssetRef(value) || isAbsoluteAssetUrl(value)) {
		throw error(400, 'Unsupported asset value');
	}

	const requestContext = { locals, cookies };

	try {
		const repository = requireGitHubRepository(requestContext, url.pathname);
		const rootConfig = await repository.backend.readRootConfig();
		const assetsDir = url.searchParams.get('assetsDir');
		const allowedAssetDirs = [
			...(assetsDir ? [assetsDir] : []),
			...(rootConfig?.assetsDir ? [rootConfig.assetsDir] : [])
		];
		const assetPath = resolveGitHubAssetPath({
			value,
			assetsDirs: allowedAssetDirs
		});

		if (!assetPath) {
			throw error(400, 'Invalid asset path');
		}

		const draftBranch =
			(await getTentmanDraftBranchName(
				repository.octokit,
				repository.owner,
				repository.name
			)) ?? null;
		let bytes: Uint8Array | null = null;

		if (draftBranch) {
			try {
				bytes = await readGitHubAssetFile({
					octokit: repository.octokit,
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
				octokit: repository.octokit,
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
