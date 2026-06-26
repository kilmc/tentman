import type { ParsedContentConfig } from '$lib/config/parse';
import type { RootConfig } from '$lib/config/root-config';

export function getReviewConfigHref(configSlug: string, isCollection: boolean): string {
	return isCollection ? `/pages/${configSlug}` : `/pages/${configSlug}/edit`;
}

export function getReviewItemHref(configSlug: string, itemId: string): string {
	return `/pages/${configSlug}/${encodeURIComponent(itemId)}`;
}

export function buildRepoAssetPreviewUrl(input: {
	owner: string;
	repo: string;
	ref: string;
	value: string;
	assets?: RootConfig['assets'] | null;
}): string | null {
	if (!input.assets) {
		return null;
	}

	const params = new URLSearchParams({
		value: input.value,
		assetPath: input.assets.path,
		publicPath: input.assets.publicPath,
		owner: input.owner,
		repo: input.repo,
		branch: input.ref
	});

	return `/api/repo/asset?${params.toString()}`;
}

export function isCollectionConfig(config: ParsedContentConfig): boolean {
	return Boolean(config.collection);
}
