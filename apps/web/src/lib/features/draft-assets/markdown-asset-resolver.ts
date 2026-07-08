import { draftAssetStore } from '$lib/features/draft-assets/store';
import { isDraftAssetRef } from '$lib/features/draft-assets/shared';
import {
	resolveAssetUrlForRender,
	type AssetRenderContext
} from '$lib/features/assets/render-context';
import { resolveLocalAssetObjectUrl } from '$lib/features/assets/local-asset-resolver';
import {
	collectMarkdownAssetValues,
	replaceMarkdownAssetValues
} from '$lib/features/draft-assets/markdown-refs';

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
	const assetValues = collectMarkdownAssetValues(value);

	await Promise.all(
		assetValues.map(async (assetValue) => {
			const resolved = await resolveClientAssetUrl(assetValue, context);
			if (resolved && resolved !== assetValue) {
				replacements.set(assetValue, resolved);
			}
		})
	);

	return replaceMarkdownAssetValues(value, replacements);
}
