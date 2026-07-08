import {
	audioAssetFilter,
	fileAssetFilter,
	imageAssetFilter,
	videoAssetFilter,
	type AssetPickerFilter,
	type AssetPickerKind
} from '$lib/features/assets/asset-picker';

export const MAX_DRAFT_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_DRAFT_AUDIO_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_DRAFT_VIDEO_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_DRAFT_FILE_SIZE = 25 * 1024 * 1024;

function getDraftAssetFilter(kind: AssetPickerKind): AssetPickerFilter {
	switch (kind) {
		case 'image':
			return imageAssetFilter;
		case 'audio':
			return audioAssetFilter;
		case 'video':
			return videoAssetFilter;
		case 'file':
			return fileAssetFilter;
	}
}

function getDraftAssetMaxFileSize(kind: AssetPickerKind): number {
	switch (kind) {
		case 'image':
			return MAX_DRAFT_IMAGE_FILE_SIZE;
		case 'audio':
			return MAX_DRAFT_AUDIO_FILE_SIZE;
		case 'video':
			return MAX_DRAFT_VIDEO_FILE_SIZE;
		case 'file':
			return MAX_DRAFT_FILE_SIZE;
	}
}

function getDraftAssetKindLabel(kind: AssetPickerKind): string {
	switch (kind) {
		case 'image':
			return 'image';
		case 'audio':
			return 'audio';
		case 'video':
			return 'video';
		case 'file':
			return 'file';
	}
}

function getFileExtension(name: string): string {
	const index = name.lastIndexOf('.');
	return index > -1 ? name.slice(index).toLowerCase() : '';
}

function fileMatchesFilter(file: File, filter: AssetPickerFilter): boolean {
	if (filter.mimePrefix && file.type) {
		return file.type.startsWith(filter.mimePrefix);
	}

	const extension = getFileExtension(file.name);
	return filter.extensions.some((allowed) => allowed.toLowerCase() === extension);
}

function formatMegabytes(bytes: number): string {
	return `${Math.floor(bytes / 1024 / 1024)}MB`;
}

export function getDraftAssetValidationError(file: File, kind: AssetPickerKind): string | null {
	const filter = getDraftAssetFilter(kind);
	const label = getDraftAssetKindLabel(kind);

	if (!fileMatchesFilter(file, filter)) {
		return `Please select a ${label} file`;
	}

	const maxFileSize = getDraftAssetMaxFileSize(kind);
	if (file.size > maxFileSize) {
		return `${label[0].toUpperCase()}${label.slice(1)} must be less than ${formatMegabytes(maxFileSize)}`;
	}

	return null;
}

export function getDraftImageValidationError(file: File): string | null {
	return getDraftAssetValidationError(file, 'image');
}
