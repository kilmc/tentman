interface ResolveAssetValueOptions {
	assets?: {
		path: string;
		publicPath: string;
	};
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
		assets?: {
			path: string;
			publicPath: string;
		};
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

	if (options.assets) {
		searchParams.set('assetPath', options.assets.path);
		searchParams.set('publicPath', options.assets.publicPath);
	}

	if (options.repository) {
		searchParams.set('owner', options.repository.owner);
		searchParams.set('repo', options.repository.name);
		searchParams.set('branch', options.repository.defaultBranch);
	}

	return `/api/repo/asset?${searchParams.toString()}`;
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

	if (options.assets) {
		const publicPath =
			options.assets.publicPath === '/'
				? `/${trimLeadingSlash(trimmedValue)}`
				: `${trimTrailingSlash(options.assets.publicPath)}/${trimLeadingSlash(trimmedValue)}`;
		return previewBaseUrl ? new URL(publicPath, previewBaseUrl).toString() : publicPath;
	}

	return previewBaseUrl ? new URL(trimmedValue, previewBaseUrl).toString() : trimmedValue;
}
