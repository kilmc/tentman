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
	| 'select'
	| 'tags';

export interface SelectBlockOption {
	value: string;
	label: string;
}

export type StaticSelectBlockOptions = SelectBlockOption[];

export interface TentmanGroupBlockOptions {
	collection: string;
	canAddOption?: boolean;
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
	isItemLabel?: boolean;
	itemLabelFormat?: Intl.DateTimeFormatOptions;
	assetsDir?: string;
	components?: string[];
	generated?: boolean;
	show?: 'primary' | 'secondary';
	minLength?: number;
	maxLength?: number;
	options?: SelectBlockOptions;
	referenceFor?: string | string[];
	referenceLabel?: boolean;
}

export interface EditorLayoutConfig {
	aside?: string[];
	asideLabel?: string;
}

export interface PrimitiveBlockUsage extends BaseBlockUsage {
	type: PrimitiveBlockType;
	blocks?: never;
	content?: never;
}

export interface TentmanGroupBlockUsage extends Omit<
	BaseBlockUsage,
	'id' | 'type' | 'options' | 'collection'
> {
	id: 'tentmanGroup';
	type: 'tentmanGroup';
	collection: string;
	options?: never;
}

export interface InlineBlockUsage extends BaseBlockUsage {
	type: 'block';
	blocks: BlockUsage[];
	editorLayout?: EditorLayoutConfig;
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

export type CollectionSortDirection = 'asc' | 'desc';

export type NormalizedCollectionSortConfig =
	| {
			id: string;
			type: 'title';
			label?: string;
			defaultDirection?: CollectionSortDirection;
	  }
	| {
			id: string;
			type: 'text';
			blockId: string;
			label?: string;
			defaultDirection?: CollectionSortDirection;
	  }
	| {
			id: string;
			type: 'date';
			blockId: string;
			label?: string;
			defaultDirection?: CollectionSortDirection;
	  };

export type AuthoredCollectionSortConfig =
	| {
			id?: string;
			type: 'alphabetical';
			blockId?: string;
			label?: string;
			defaultDirection?: CollectionSortDirection;
	  }
	| {
			id?: string;
			type: 'chronological';
			blockId: string;
			label?: string;
			defaultDirection?: CollectionSortDirection;
	  };

export type CollectionSortConfig = NormalizedCollectionSortConfig | AuthoredCollectionSortConfig;

export type CollectionDefaultSortConfig =
	| string
	| {
			id: string;
			direction?: CollectionSortDirection;
	  };

export interface CollectionBehaviorConfig {
	ordering?: boolean;
	groupManagement?: boolean;
	defaultSort?: CollectionDefaultSortConfig;
	sorts?: CollectionSortConfig[];
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
	editorLayout?: EditorLayoutConfig;
	state?: StateConfig;
}

export interface BlockConfig {
	type: 'block';
	id: string;
	label: string;
	itemLabel?: string;
	collection?: boolean;
	blocks: BlockUsage[];
	editorLayout?: EditorLayoutConfig;
}

export type TentmanConfigFile = ContentConfig | BlockConfig;

export interface RootConfig {
	siteName?: string;
	blocksDir?: string;
	configsDir?: string;
	assets?: {
		path: string;
		publicPath: string;
	};
	componentsDir?: string;
	blockPackages?: string[];
	validation?: {
		contentComponents?: 'permissive' | 'strict';
	};
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
