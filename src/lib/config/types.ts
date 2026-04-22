export type PrimitiveBlockType =
	| 'text'
	| 'textarea'
	| 'markdown'
	| 'email'
	| 'url'
	| 'number'
	| 'date'
	| 'boolean'
	| 'image'
	| 'select';

export interface SelectBlockOption {
	value: string;
	label: string;
}

export type StaticSelectBlockOptions = SelectBlockOption[];

export interface NavigationGroupsSelectBlockOptions {
	source: 'tentman.navigationGroups';
	collection: string;
	addOption?: boolean;
}

export type SelectBlockOptions = StaticSelectBlockOptions | NavigationGroupsSelectBlockOptions;

export interface BaseBlockUsage {
	id: string;
	type: string;
	label?: string;
	required?: boolean;
	collection?: boolean;
	itemLabel?: string;
	assetsDir?: string;
	plugins?: string[];
	generated?: boolean;
	show?: 'primary' | 'secondary';
	minLength?: number;
	maxLength?: number;
	options?: SelectBlockOptions;
}

export interface PrimitiveBlockUsage extends BaseBlockUsage {
	type: PrimitiveBlockType;
	blocks?: never;
	content?: never;
}

export interface InlineBlockUsage extends BaseBlockUsage {
	type: 'block';
	blocks: BlockUsage[];
	content?: never;
}

export interface ReusableBlockUsage extends BaseBlockUsage {
	type: string;
	blocks?: never;
	content?: never;
}

export type BlockUsage = PrimitiveBlockUsage | InlineBlockUsage | ReusableBlockUsage;

export interface EmbeddedContentMode {
	mode: 'embedded';
}

export interface FileContentMode {
	mode: 'file';
	path: string;
	itemsPath?: string;
}

export interface DirectoryContentMode {
	mode: 'directory';
	path: string;
	template: string;
	filename?: string;
}

export type ContentMode = EmbeddedContentMode | FileContentMode | DirectoryContentMode;

export interface ContentConfig {
	type: 'content';
	label: string;
	id?: string;
	itemLabel?: string;
	collection?: boolean;
	idField?: string;
	content: FileContentMode | DirectoryContentMode;
	blocks: BlockUsage[];
}

export interface BlockConfig {
	type: 'block';
	id: string;
	label: string;
	itemLabel?: string;
	collection?: boolean;
	adapter?: string;
	blocks: BlockUsage[];
}

export type TentmanConfigFile = ContentConfig | BlockConfig;

export interface RootConfig {
	siteName?: string;
	blocksDir?: string;
	configsDir?: string;
	assetsDir?: string;
	pluginsDir?: string;
	plugins?: string[];
	blockPackages?: string[];
	netlify?: {
		siteName: string;
	};
	local?: {
		previewUrl: string;
	};
}
