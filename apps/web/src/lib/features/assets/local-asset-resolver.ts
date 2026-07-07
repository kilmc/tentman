import { get } from 'svelte/store';
import {
	parseRootAssetsConfig,
	resolveManagedAssetValue,
	type RootAssetConfig
} from '@tentman/core/assets-config';
import { localRepo } from '$lib/stores/local-repo';
import { isAbsoluteAssetUrl } from '$lib/utils/assets';

type ObjectUrlCacheEntry = {
	objectUrl: string;
	size: number;
	lastModified: number;
};

const objectUrlCache = new Map<string, ObjectUrlCacheEntry>();

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

function getParentFallbackAssetMapping(assets: RootAssetConfig): RootAssetConfig | null {
	const assetSegments = trimTrailingSlash(assets.path).split('/').filter(Boolean);
	const publicSegments = trimTrailingSlash(assets.publicPath).split('/').filter(Boolean);

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

function getRepoPath(value: string, assets: RootAssetConfig): string | null {
	const parsedAssets = parseRootAssetsConfig(assets);
	const resolved = resolveManagedAssetValue(value, parsedAssets);
	if (resolved.valid === true && typeof resolved.repoPath === 'string') {
		return resolved.repoPath;
	}

	if (resolved.reason === 'public-path-mismatch' && value.trim().startsWith('/')) {
		const fallbackMapping = getParentFallbackAssetMapping(parsedAssets);
		if (fallbackMapping) {
			const fallbackResolved = resolveManagedAssetValue(
				value,
				parseRootAssetsConfig(fallbackMapping)
			);
			return fallbackResolved.valid === true && typeof fallbackResolved.repoPath === 'string'
				? fallbackResolved.repoPath
				: null;
		}
	}

	return null;
}

function getObjectUrlCacheKey(backendKey: string, path: string): string {
	return `${backendKey}:${path}`;
}

function createObjectUrl(file: File): string | null {
	return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

function revokeObjectUrl(objectUrl: string): void {
	if (typeof URL.revokeObjectURL === 'function') {
		URL.revokeObjectURL(objectUrl);
	}
}

export async function resolveLocalAssetObjectUrl(
	value: string,
	assets: RootAssetConfig | null
): Promise<string | null> {
	const trimmedValue = value.trim();
	if (!trimmedValue || isAbsoluteAssetUrl(trimmedValue) || !assets) {
		return null;
	}

	const path = getRepoPath(trimmedValue, assets);
	if (!path) {
		return null;
	}

	const backend = get(localRepo).backend;
	if (!backend) {
		return null;
	}

	const file = await backend.readFile(path);
	const cacheKey = getObjectUrlCacheKey(backend.cacheKey, path);
	const cached = objectUrlCache.get(cacheKey);
	if (cached && cached.size === file.size && cached.lastModified === file.lastModified) {
		return cached.objectUrl;
	}

	if (cached) {
		revokeObjectUrl(cached.objectUrl);
	}

	const objectUrl = createObjectUrl(file);
	if (!objectUrl) {
		return null;
	}

	objectUrlCache.set(cacheKey, {
		objectUrl,
		size: file.size,
		lastModified: file.lastModified
	});

	return objectUrl;
}
