import {
	isIgnoredAssetValue,
	parseRootAssetsConfig,
	resolveManagedAssetValue
} from '@tentman/core/assets-config';

type ResolvedGitHubAssetPath = {
	ok: true;
	path: string;
	mapping: 'configured' | 'public-path-parent-fallback';
};

type RejectedGitHubAssetPath = {
	ok: false;
	reason:
		| 'ignored-value'
		| 'query-or-hash'
		| 'invalid-mapping'
		| 'public-path-mismatch'
		| 'traversal'
		| 'invalid-value';
	message: string;
};

export type GitHubAssetPathResolution = ResolvedGitHubAssetPath | RejectedGitHubAssetPath;

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

function getParentFallbackAssetMapping(input: {
	path: string;
	publicPath: string;
}): { path: string; publicPath: string } | null {
	const assetSegments = trimTrailingSlash(input.path).split('/').filter(Boolean);
	const publicSegments = trimTrailingSlash(input.publicPath).split('/').filter(Boolean);

	if (assetSegments.length < 2 || publicSegments.length < 2) {
		return null;
	}

	const assetSuffix = assetSegments.at(-1);
	const publicSuffix = publicSegments.at(-1);
	if (!assetSuffix || assetSuffix !== publicSuffix) {
		return null;
	}

	return {
		path: assetSegments.slice(0, -1).join('/'),
		publicPath: `/${publicSegments.slice(0, -1).map(trimLeadingSlash).join('/')}`
	};
}

export function resolveGitHubAssetPath(input: {
	value: string;
	assetPath: string;
	publicPath: string;
}): string | null {
	const resolved = resolveGitHubAssetPathDetailed(input);
	return resolved.ok ? resolved.path : null;
}

export function resolveGitHubAssetPathDetailed(input: {
	value: string;
	assetPath: string;
	publicPath: string;
}): GitHubAssetPathResolution {
	if (isIgnoredAssetValue(input.value)) {
		return {
			ok: false,
			reason: 'ignored-value',
			message: 'Asset value is empty or uses an unsupported URL scheme'
		};
	}

	if (input.value.includes('?') || input.value.includes('#')) {
		return {
			ok: false,
			reason: 'query-or-hash',
			message: 'Asset values with query strings or hashes are not supported'
		};
	}

	try {
		const assets = parseRootAssetsConfig({
			path: input.assetPath,
			publicPath: input.publicPath
		});

		const resolved = resolveManagedAssetValue(input.value, assets);
		if (resolved.valid && typeof resolved.repoPath === 'string') {
			return {
				ok: true,
				path: resolved.repoPath,
				mapping: 'configured'
			};
		}

		if (resolved.reason === 'public-path-mismatch' && input.value.trim().startsWith('/')) {
			const fallbackMapping = getParentFallbackAssetMapping(assets);
			if (fallbackMapping) {
				const fallbackAssets = parseRootAssetsConfig(fallbackMapping);
				const fallbackResolved = resolveManagedAssetValue(input.value, fallbackAssets);
				if (fallbackResolved.valid && typeof fallbackResolved.repoPath === 'string') {
					return {
						ok: true,
						path: fallbackResolved.repoPath,
						mapping: 'public-path-parent-fallback'
					};
				}
			}
		}

		const reason =
			resolved.reason === 'public-path-mismatch' || resolved.reason === 'traversal'
				? resolved.reason
				: 'invalid-value';
		const message =
			reason === 'public-path-mismatch'
				? `Asset value does not start with configured publicPath ${assets.publicPath}`
				: reason === 'traversal'
					? 'Asset value resolves outside the configured asset directory'
					: 'Asset value cannot be mapped to a repository path';

		return {
			ok: false,
			reason,
			message
		};
	} catch {
		return {
			ok: false,
			reason: 'invalid-mapping',
			message: 'Asset mapping must include a repo-relative assetPath and root-relative publicPath'
		};
	}
}

export function getAssetContentType(path: string): string {
	const extension = path.slice(path.lastIndexOf('.')).toLowerCase();

	switch (extension) {
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.png':
			return 'image/png';
		case '.webp':
			return 'image/webp';
		case '.gif':
			return 'image/gif';
		case '.svg':
			return 'image/svg+xml';
		case '.avif':
			return 'image/avif';
		default:
			return 'application/octet-stream';
	}
}
