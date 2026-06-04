import type { DiscoveredConfig } from '$lib/config/discovery';
import type { ContentDeleteOptions } from '$lib/content/adapters/types';
import { findContentItemByRoute } from '$lib/features/content-management/item';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';
import { resolveCollectionItemDocument } from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';

export function parseEncodedPreviewContentData(encodedData: string): ContentRecord {
	return JSON.parse(Buffer.from(encodedData, 'base64url').toString()) as ContentRecord;
}

export function getExistingItemMutationOptions(
	contentMode: 'file' | 'directory',
	itemId: string,
	filename?: string,
	newFilename?: string
) {
	if (contentMode === 'directory') {
		if (!filename) {
			return null;
		}

		return {
			filename,
			...(newFilename && newFilename !== filename ? { newFilename } : {})
		};
	}

	return { itemId };
}

export async function resolveExistingCollectionItemDeleteOptions({
	backend,
	discoveredConfig,
	itemId,
	branch
}: {
	backend: RepositoryBackend;
	discoveredConfig: DiscoveredConfig;
	itemId: string;
	branch: string;
}): Promise<ContentDeleteOptions> {
	if (discoveredConfig.config.content.mode === 'file') {
		return {
			branch,
			itemId
		};
	}

	const resolvedItem = await resolveCollectionItemDocument({
		backend,
		slug: discoveredConfig.slug,
		itemId,
		ref: branch
	});
	if (resolvedItem?.indexItem.filename) {
		return {
			branch,
			filename: resolvedItem.indexItem.filename
		};
	}

	const content = await getCachedContent(
		backend,
		discoveredConfig.config,
		discoveredConfig.path,
		discoveredConfig.slug,
		branch
	);
	if (!Array.isArray(content)) {
		return { branch };
	}

	const item = findContentItemByRoute(content, discoveredConfig.config, itemId);
	return {
		branch,
		...(item?._filename ? { filename: item._filename } : {})
	};
}
