import { page } from '$app/state';
import { draftAssetStore } from '$lib/features/draft-assets/store';
import { isDraftAssetRef } from '$lib/features/draft-assets/shared';
import { buildRepoAssetProxyUrl, isAbsoluteAssetUrl, resolveAssetValue } from '$lib/utils/assets';

interface ResolveClientAssetUrlOptions {
	assets?: {
		path: string;
		publicPath: string;
	};
	previewBaseUrl?: string | null;
}

const MARKDOWN_IMAGE_PATTERN =
	/!\[[^\]]*]\((?:<([^>\s]+)>|([^\s)]+))((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/g;
const HTML_IMAGE_PATTERN = /<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*?)>/gi;

export async function resolveClientAssetUrl(
	value: string | null | undefined,
	options: ResolveClientAssetUrlOptions = {}
): Promise<string | null> {
	if (!value) {
		return null;
	}

	if (isDraftAssetRef(value)) {
		return draftAssetStore.resolveUrl(value);
	}

	if (page.data.selectedBackend?.kind === 'github' && !isAbsoluteAssetUrl(value) && options.assets) {
		return buildRepoAssetProxyUrl(value, {
			assets: options.assets,
			repository: page.data.selectedRepo
				? {
						owner: page.data.selectedRepo.owner,
						name: page.data.selectedRepo.name,
						defaultBranch: page.data.selectedRepo.default_branch
					}
				: null
		});
	}

	return resolveAssetValue(value, options);
}

export async function resolveMarkdownAssetUrls(
	value: string,
	options: ResolveClientAssetUrlOptions = {}
): Promise<string> {
	const replacements = new Map<string, string>();
	const assetValues = new Set<string>();

	for (const match of value.matchAll(MARKDOWN_IMAGE_PATTERN)) {
		const assetValue = match[1] ?? match[2];
		if (assetValue) {
			assetValues.add(assetValue);
		}
	}

	for (const match of value.matchAll(HTML_IMAGE_PATTERN)) {
		if (match[3]) {
			assetValues.add(match[3]);
		}
	}

	await Promise.all(
		[...assetValues].map(async (assetValue) => {
			const resolved = await resolveClientAssetUrl(assetValue, options);
			if (resolved && resolved !== assetValue) {
				replacements.set(assetValue, resolved);
			}
		})
	);

	if (replacements.size === 0) {
		return value;
	}

	let nextValue = value.replace(MARKDOWN_IMAGE_PATTERN, (match, angleValue, plainValue) => {
		const assetValue = angleValue ?? plainValue;
		const replacement = replacements.get(assetValue);
		return replacement ? match.replace(assetValue, replacement) : match;
	});

	nextValue = nextValue.replace(
		HTML_IMAGE_PATTERN,
		(match, beforeSrc, quote, assetValue, afterSrc) => {
			const replacement = replacements.get(assetValue);
			return replacement ? `<img${beforeSrc}src=${quote}${replacement}${quote}${afterSrc}>` : match;
		}
	);

	return nextValue;
}
