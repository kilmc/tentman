export type PrimitiveBlockType =
	| 'text'
	| 'textarea'
	| 'markdown'
	| 'email'
	| 'url'
	| 'number'
	| 'date'
	| 'boolean'
	| 'toggle'
	| 'image'
	| 'select';

export interface SelectBlockOption {
	value: string;
	label: string;
}

export type StaticSelectBlockOptions = SelectBlockOption[];

export interface TentmanGroupBlockOptions {
	collection: string;
	addOption?: boolean;
}

export interface NavigationManifestCollection {
	id?: string;
	label?: string;
	slug?: string;
	href?: string;
	configId?: string;
	items: string[];
	groups?: Array<{
		id: string;
		label?: string;
		value?: string;
		items: string[];
	}>;
}

export type SelectBlockOptions = StaticSelectBlockOptions;

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

export interface TentmanGroupBlockUsage
	extends Omit<BaseBlockUsage, 'id' | 'type' | 'options' | 'collection'> {
	id: 'tentmanGroup';
	type: 'tentmanGroup';
	collection: string;
	addOption?: boolean;
	options?: never;
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

export type BlockUsage =
	| PrimitiveBlockUsage
	| TentmanGroupBlockUsage
	| InlineBlockUsage
	| ReusableBlockUsage;

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

export interface CollectionGroupConfig {
	_tentmanId?: string;
	label: string;
	value?: string;
}

export type StateValue = string | number | boolean | null;

export type StateVariant = 'muted' | 'accent' | 'success' | 'warning' | 'danger';

export interface StateCase {
	value: StateValue;
	label: string;
	variant?: StateVariant;
	icon?: string;
}

export interface StatePreset {
	cases: StateCase[];
}

export interface StateVisibility {
	navigation?: boolean;
	header?: boolean;
	card?: boolean;
}

export interface StateConfig {
	blockId: string;
	preset?: string;
	cases?: StateCase[];
	visibility?: StateVisibility;
}

export interface CollectionBehaviorConfig {
	sorting?: 'manual';
	groups?: CollectionGroupConfig[];
	state?: StateConfig;
}

export interface ContentConfig {
	type: 'content';
	label: string;
	id?: string;
	_tentmanId?: string;
	itemLabel?: string;
	collection?: boolean | CollectionBehaviorConfig;
	idField?: string;
	content: FileContentMode | DirectoryContentMode;
	blocks: BlockUsage[];
	state?: StateConfig;
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
	debug?: {
		cacheConfigs?: boolean;
	};
	content?: {
		sorting?: 'manual';
	};
	statePresets?: Record<string, StatePreset>;
	netlify?: {
		siteName: string;
	};
	local?: {
		previewUrl: string;
	};
}
