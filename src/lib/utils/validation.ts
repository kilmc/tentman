import type { Config, FieldDefinition } from '$lib/types/config';

export interface ValidationError {
	field: string;
	message: string;
}

export function validateFormData(
	config: Config,
	data: Record<string, any>,
	options?: {
		existingItems?: any[];
		currentItemId?: string;
	}
): ValidationError[] {
	const errors: ValidationError[] = [];

	for (const [fieldName, fieldDef] of Object.entries(config.fields)) {
		const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;
		const required = typeof fieldDef === 'object' ? fieldDef.required ?? false : false;
		const value = data[fieldName];

		// Check required fields
		if (required && (value === undefined || value === null || value === '')) {
			errors.push({
				field: fieldName,
				message: `${getFieldLabel(fieldName)} is required`
			});
			continue;
		}

		// Skip validation if field is empty and not required
		if (value === undefined || value === null || value === '') {
			continue;
		}

		// Type-specific validation
		switch (fieldType) {
			case 'email':
				if (!isValidEmail(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid email address`
					});
				}
				break;

			case 'url':
				if (!isValidUrl(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid URL`
					});
				}
				break;

			case 'number':
				if (typeof value !== 'number' || isNaN(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid number`
					});
				}
				break;

			case 'date':
				if (!isValidDate(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be a valid date`
					});
				}
				break;

			case 'array':
				if (!Array.isArray(value)) {
					errors.push({
						field: fieldName,
						message: `${getFieldLabel(fieldName)} must be an array`
					});
				}
				break;
		}
	}

	// Validate uniqueness for ID field (if configured)
	if (config.idField && options?.existingItems) {
		const idValue = data[config.idField];
		if (idValue) {
			const isDuplicate = options.existingItems.some((item) => {
				// Skip checking against the current item (when editing)
				if (options.currentItemId && item[config.idField] === options.currentItemId) {
					return false;
				}
				return item[config.idField] === idValue;
			});

			if (isDuplicate) {
				errors.push({
					field: config.idField,
					message: `${getFieldLabel(config.idField)} must be unique. This value is already in use.`
				});
			}
		}
	}

	return errors;
}

function getFieldLabel(fieldName: string): string {
	return fieldName
		.replace(/([A-Z])/g, ' $1')
		.replace(/_/g, ' ')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function isValidDate(date: string): boolean {
	const parsedDate = new Date(date);
	return !isNaN(parsedDate.getTime());
}
