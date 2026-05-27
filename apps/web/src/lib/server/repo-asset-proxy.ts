import { getPublicPathFromAssetsDir } from '$lib/utils/assets';
import { normalizeDraftAssetStoragePath } from '$lib/features/draft-assets/shared';

function trimLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

function normalizeRepoRelativePath(value: string): string {
	const segments = value.replace(/\\/g, '/').split('/');
	const normalizedSegments: string[] = [];

	for (const segment of segments) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (normalizedSegments.length > 0) {
				normalizedSegments.pop();
			}
			continue;
		}

		normalizedSegments.push(segment);
	}

	return normalizedSegments.join('/');
}

function joinAssetPath(rootDir: string, assetValue: string): string | null {
	const normalizedRootDir = normalizeDraftAssetStoragePath(rootDir);
	const joinedPath = normalizeRepoRelativePath(`${normalizedRootDir}${trimLeadingSlash(assetValue)}`);
	return joinedPath.startsWith(normalizedRootDir) ? joinedPath : null;
}

function resolvePublicAssetPath(rootDir: string, assetValue: string): string | null {
	const publicPath = getPublicPathFromAssetsDir(rootDir);
	if (!publicPath) {
		return null;
	}

	const normalizedPublicPath = publicPath === '/' ? '/' : publicPath.replace(/\/+$/, '');
	if (normalizedPublicPath !== '/' && assetValue !== normalizedPublicPath && !assetValue.startsWith(`${normalizedPublicPath}/`)) {
		return null;
	}

	if (normalizedPublicPath === '/' && !assetValue.startsWith('/')) {
		return null;
	}

	const relativeAssetPath =
		normalizedPublicPath === '/'
			? trimLeadingSlash(assetValue)
			: trimLeadingSlash(assetValue.slice(normalizedPublicPath.length));

	return joinAssetPath(rootDir, relativeAssetPath);
}

export function resolveGitHubAssetPath(input: {
	value: string;
	assetsDirs: string[];
}): string | null {
	const trimmedValue = input.value.trim();
	if (!trimmedValue) {
		return null;
	}

	const normalizedDirs = Array.from(
		new Set(
			input.assetsDirs
				.map((assetsDir) => assetsDir.trim())
				.filter((assetsDir) => assetsDir.length > 0)
				.map((assetsDir) => normalizeDraftAssetStoragePath(assetsDir))
		)
	);

	if (normalizedDirs.length === 0) {
		return null;
	}

	if (trimmedValue.startsWith('/')) {
		const sortedDirs = [...normalizedDirs].sort((left, right) => right.length - left.length);
		for (const rootDir of sortedDirs) {
			const resolvedPath = resolvePublicAssetPath(rootDir, trimmedValue);
			if (resolvedPath) {
				return resolvedPath;
			}
		}

		return null;
	}

	for (const rootDir of normalizedDirs) {
		const resolvedPath = joinAssetPath(rootDir, trimmedValue);
		if (resolvedPath) {
			return resolvedPath;
		}
	}

	return null;
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
