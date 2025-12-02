/**
 * Type definitions for Tentman CMS configuration files
 */

export type FieldType =
	| 'text'
	| 'textarea'
	| 'markdown'
	| 'email'
	| 'url'
	| 'number'
	| 'date'
	| 'boolean'
	| 'image'
	| 'array';

export interface FieldOptions {
	type: FieldType;
	label?: string; // Optional custom display label
	required?: boolean;
	generated?: boolean;
	show?: 'primary' | 'secondary'; // Display on index cards (primary = title, secondary = metadata)
	fields?: Record<string, FieldDefinition>; // For nested fields in arrays
}

export type FieldDefinition = FieldType | FieldOptions;

// Array format (alternative): fields as array with explicit order and labels
export interface FieldArrayItem {
	property: string; // The property name in the content data (e.g., "title", "coverImage")
	label: string; // Display label (e.g., "Title", "Cover Image")
	type: FieldType;
	required?: boolean;
	generated?: boolean;
	show?: 'primary' | 'secondary'; // Display on index cards (primary = title, secondary = metadata)
	fields?: FieldArrayItem[]; // For nested fields in arrays
}

export interface BaseConfig {
	label: string;
	idField?: string;
	fields: Record<string, FieldDefinition> | FieldArrayItem[]; // Support both formats
	imagePath?: string; // Custom path for image uploads (defaults to 'static/images/')
}

export interface SingletonConfig extends BaseConfig {
	contentFile: string;
	// No collectionPath, no template
}

export interface SingleFileArrayConfig extends BaseConfig {
	contentFile: string;
	collectionPath: string;
	idField: string; // Required for arrays
	// No template
}

export interface MultiFileCollectionConfig extends BaseConfig {
	template: string;
	filename?: string; // DEPRECATED: Users now enter filename manually when creating items
	idField: string; // Required for collections
	// No contentFile, no collectionPath
}

export type Config = SingletonConfig | SingleFileArrayConfig | MultiFileCollectionConfig;

export type ConfigType = 'singleton' | 'array' | 'collection';

export interface DiscoveredConfig {
	path: string; // Path to config file in repo
	slug: string; // URL-friendly identifier
	config: Config;
	type: ConfigType;
}

/**
 * Normalize fields from array format to object format
 * Converts array of field definitions to keyed object
 */
export function normalizeFields(
	fields: Record<string, FieldDefinition> | FieldArrayItem[]
): Record<string, FieldDefinition> {
	// Already in object format
	if (!Array.isArray(fields)) {
		return fields;
	}

	// Convert array format to object format using the property names
	const normalized: Record<string, FieldDefinition> = {};

	for (const field of fields) {
		// Build field definition
		if (field.required || field.generated || field.show || field.fields) {
			normalized[field.property] = {
				type: field.type,
				label: field.label, // Preserve the label
				...(field.required && { required: field.required }),
				...(field.generated && { generated: field.generated }),
				...(field.show && { show: field.show }),
				...(field.fields && {
					fields: normalizeFields(field.fields) as Record<string, FieldDefinition>
				})
			};
		} else {
			// Simple field: just type, but preserve label
			normalized[field.property] = {
				type: field.type,
				label: field.label
			};
		}
	}

	return normalized;
}

/**
 * Get the display label for a field
 * If field has explicit label, use it; otherwise generate from field name
 */
export function getFieldLabel(fieldName: string, fieldDef: FieldDefinition): string {
	// If it's an object with a label property, use it
	if (typeof fieldDef === 'object' && 'label' in fieldDef && fieldDef.label) {
		return fieldDef.label;
	}

	// Otherwise, generate from field name: camelCase → Title Case
	return fieldName
		.replace(/([A-Z])/g, ' $1')
		.replace(/_/g, ' ')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}
