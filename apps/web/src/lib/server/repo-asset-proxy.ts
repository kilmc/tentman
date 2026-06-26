import {
	buildManagedAssetRepoPath,
	isIgnoredAssetValue,
	parseRootAssetsConfig
} from '@tentman/core/assets-config';

export function resolveGitHubAssetPath(input: {
	value: string;
	assetPath: string;
	publicPath: string;
}): string | null {
	if (isIgnoredAssetValue(input.value)) {
		return null;
	}

	if (input.value.includes('?') || input.value.includes('#')) {
		return null;
	}

	try {
		const assets = parseRootAssetsConfig({
			path: input.assetPath,
			publicPath: input.publicPath
		});

		return buildManagedAssetRepoPath(input.value, assets);
	} catch {
		return null;
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
