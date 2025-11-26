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
	required?: boolean;
	generated?: boolean;
	fields?: Record<string, FieldDefinition>; // For nested fields in arrays
}

export type FieldDefinition = FieldType | FieldOptions;

export interface BaseConfig {
	label: string;
	idField?: string;
	fields: Record<string, FieldDefinition>;
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
	filename: string; // Pattern like {{slug}}
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
