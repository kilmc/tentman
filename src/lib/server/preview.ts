import type { ContentRecord } from '$lib/features/content-management/types';

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
