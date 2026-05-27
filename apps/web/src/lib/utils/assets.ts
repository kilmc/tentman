interface ResolveAssetValueOptions {
	assetsDir?: string;
	previewBaseUrl?: string | null;
}

export function isAbsoluteAssetUrl(value: string): boolean {
	return /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

export function buildRepoAssetProxyUrl(
	value: string,
	options: {
		assetsDir?: string;
		repository?: {
			owner: string;
			name: string;
			defaultBranch: string;
		} | null;
	} = {}
): string {
	const searchParams = new URLSearchParams({
		value
	});

	const assetsDir = options.assetsDir?.trim();
	if (assetsDir) {
		searchParams.set('assetsDir', assetsDir);
	}

	if (options.repository) {
		searchParams.set('owner', options.repository.owner);
		searchParams.set('repo', options.repository.name);
		searchParams.set('branch', options.repository.defaultBranch);
	}

	return `/api/repo/asset?${searchParams.toString()}`;
}

export function getPublicPathFromAssetsDir(assetsDir?: string): string | null {
	if (!assetsDir) {
		return null;
	}

	const normalized = assetsDir.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
	const staticIndex = normalized.lastIndexOf('/static/');

	if (staticIndex >= 0) {
		return normalized.slice(staticIndex + '/static'.length);
	}

	if (normalized.startsWith('static/')) {
		return `/${normalized.slice('static/'.length)}`;
	}

	if (normalized === 'static') {
		return '/';
	}

	return null;
}

export function resolveAssetValue(
	value: string | undefined | null,
	options: ResolveAssetValueOptions = {}
): string | null {
	if (!value) {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	if (isAbsoluteAssetUrl(trimmedValue)) {
		return trimmedValue;
	}

	const previewBaseUrl = options.previewBaseUrl?.trim() || null;

	if (trimmedValue.startsWith('/')) {
		return previewBaseUrl ? new URL(trimmedValue, previewBaseUrl).toString() : trimmedValue;
	}

	const publicAssetsPath = getPublicPathFromAssetsDir(options.assetsDir);
	if (publicAssetsPath) {
		const publicPath = `${trimTrailingSlash(publicAssetsPath)}/${trimLeadingSlash(trimmedValue)}`;
		return previewBaseUrl ? new URL(publicPath, previewBaseUrl).toString() : publicPath;
	}

	return previewBaseUrl ? new URL(trimmedValue, previewBaseUrl).toString() : trimmedValue;
}
