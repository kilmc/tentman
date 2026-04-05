export type ContentPrimitive = string | number | boolean | null;
export type ContentValue = ContentPrimitive | ContentRecord | ContentValue[];

export interface ContentRecord {
	[key: string]: ContentValue | undefined;
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
