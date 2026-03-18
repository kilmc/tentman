import type { ConfigType } from '$lib/types/config';

export type ContentPrimitive = string | number | boolean | null;
export type ContentValue = ContentPrimitive | ContentRecord | ContentValue[];

export interface ContentRecord {
	[key: string]: ContentValue | undefined;
	_body?: string;
	_filename?: string;
}

export type ContentDocument = ContentRecord | ContentRecord[];

export interface TemplateInfo {
	resolvedTemplatePath: string;
	templateDir: string;
	templateExt: string;
	templateFilename: string;
	isMarkdown: boolean;
}

export type ArrayContentOptions = {
	configType: 'array';
	itemId?: string;
	itemIndex?: number;
	branch?: string;
};

export type CollectionContentOptions = {
	configType: 'collection';
	filename: string;
	newFilename?: string;
	branch?: string;
};

export type SingletonContentOptions = {
	configType: 'singleton';
	branch?: string;
};

export type SaveContentOptions =
	| SingletonContentOptions
	| ArrayContentOptions
	| CollectionContentOptions;

export type DeleteContentOptions = ArrayContentOptions | CollectionContentOptions;

export interface PreviewInput {
	configType: ConfigType;
	data: ContentRecord;
	isNew?: boolean;
	itemId?: string;
	filename?: string;
	newFilename?: string;
	branch?: string;
}
