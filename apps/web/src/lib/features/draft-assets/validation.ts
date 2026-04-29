export const MAX_DRAFT_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

export function getDraftImageValidationError(file: File): string | null {
	if (!file.type.startsWith('image/')) {
		return 'Please select an image file';
	}

	if (file.size > MAX_DRAFT_IMAGE_FILE_SIZE) {
		return 'Image must be less than 5MB';
	}

	return null;
}
