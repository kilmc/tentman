import { draftAssetStore } from '$lib/features/draft-assets/store';
import { isDraftAssetRef } from '$lib/features/draft-assets/shared';
import { resolveAssetValue } from '$lib/utils/assets';

interface ResolveClientAssetUrlOptions {
	assetsDir?: string;
	previewBaseUrl?: string | null;
}

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

	return resolveAssetValue(value, options);
}
