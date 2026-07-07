import { draftAssetStore } from '$lib/features/draft-assets/store';
import { isDraftAssetRef } from '$lib/features/draft-assets/shared';
import {
	resolveAssetUrlForRender,
	type AssetRenderContext
} from '$lib/features/assets/render-context';
import { resolveLocalAssetObjectUrl } from '$lib/features/assets/local-asset-resolver';

const MARKDOWN_IMAGE_PATTERN =
	/!\[[^\]]*]\((?:<([^>\s]+)>|([^\s)]+))((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/g;
const HTML_IMAGE_PATTERN = /<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*?)>/gi;

export async function resolveClientAssetUrl(
	value: string | null | undefined,
	context: AssetRenderContext
): Promise<string | null> {
	if (!value) {
		return null;
	}

	if (isDraftAssetRef(value)) {
		return draftAssetStore.resolveUrl(value);
	}

	if (context.mode === 'local') {
		return resolveLocalAssetObjectUrl(value, context.assets);
	}

	return resolveAssetUrlForRender(value, context);
}

export async function resolveMarkdownAssetUrls(
	value: string,
	context: AssetRenderContext
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
			const resolved = await resolveClientAssetUrl(assetValue, context);
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
