// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAssetPickerEntries, type AssetPickerKind } from '$lib/features/assets/asset-picker';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubContentRepository } from '$lib/server/page-context';

const SUPPORTED_KINDS = new Set<AssetPickerKind>(['image', 'video', 'audio', 'file']);

function parseExtensions(value: string | null): string[] {
	return (value ?? '')
		.split(',')
		.map((extension) => extension.trim().toLowerCase())
		.filter((extension) => extension.startsWith('.') && extension.length > 1);
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const assetPath = url.searchParams.get('assetPath')?.trim();
	const publicPath = url.searchParams.get('publicPath')?.trim();
	const kind = url.searchParams.get('kind') as AssetPickerKind | null;
	const extensions = parseExtensions(url.searchParams.get('extensions'));

	console.info('[tentman:asset-picker] api request', {
		assetPath: assetPath ?? null,
		publicPath: publicPath ?? null,
		kind,
		extensions
	});

	if (!assetPath || !publicPath || !kind || extensions.length === 0) {
		console.warn('[tentman:asset-picker] api rejected: missing parameters', {
			hasAssetPath: Boolean(assetPath),
			hasPublicPath: Boolean(publicPath),
			kind,
			extensionsCount: extensions.length
		});
		throw error(400, 'Missing asset picker parameters');
	}

	if (!SUPPORTED_KINDS.has(kind)) {
		console.warn('[tentman:asset-picker] api rejected: unsupported kind', { kind });
		throw error(400, 'Unsupported asset picker kind');
	}

	try {
		const { backend } = await requireGitHubContentRepository({ locals, cookies });
		const rootConfig = await backend.readRootConfig();
		const configuredAssets = rootConfig?.assets;

		if (
			!configuredAssets ||
			configuredAssets.path !== assetPath ||
			configuredAssets.publicPath !== publicPath
		) {
			console.warn('[tentman:asset-picker] api rejected: invalid mapping', {
				requested: { assetPath, publicPath },
				configured: configuredAssets ?? null
			});
			throw error(400, 'Invalid asset picker mapping');
		}

		const entries = await listAssetPickerEntries({
			backend,
			config: {
				assetPath: configuredAssets.path,
				publicPath: configuredAssets.publicPath
			},
			filter: { kind, extensions }
		});
		console.info('[tentman:asset-picker] api complete', {
			count: entries.length,
			assetPath,
			publicPath,
			kind
		});
		return json({
			entries
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.warn('[tentman:asset-picker] api failed', {
			message: err instanceof Error ? err.message : String(err)
		});
		handleGitHubSessionError({ cookies }, err);
		throw error(500, 'Failed to list assets');
	}
};
