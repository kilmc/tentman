import type { ParsedContentConfig } from '$lib/config/parse';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';

export interface ContentOperationContext {
	backend: RepositoryBackend;
	config: ParsedContentConfig;
	configPath: string;
}

export interface ContentFetchOptions {
	branch?: string;
}

export interface ContentSaveOptions {
	itemIndex?: number;
	itemId?: string;
	filename?: string;
	newFilename?: string;
	branch?: string;
}

export interface ContentCreateOptions {
	filename?: string;
	branch?: string;
}

export interface ContentDeleteOptions {
	itemIndex?: number;
	itemId?: string;
	filename?: string;
	branch?: string;
}

export interface FileChange {
	path: string;
	type: 'create' | 'update' | 'delete';
	oldContent?: string;
	newContent?: string;
	diff?: string;
	size?: number;
}

export interface ChangesSummary {
	files: FileChange[];
	totalChanges: number;
}

export interface ContentPreviewOptions {
	isNew?: boolean;
	itemIndex?: number;
	itemId?: string;
	filename?: string;
	newFilename?: string;
	branch?: string;
}

export interface ContentAdapter {
	mode: ParsedContentConfig['content']['mode'];
	fetch(context: ContentOperationContext, options?: ContentFetchOptions): Promise<ContentDocument>;
	save(
		context: ContentOperationContext,
		data: ContentRecord,
		options?: ContentSaveOptions
	): Promise<void>;
	create?(
		context: ContentOperationContext,
		data: ContentRecord,
		options?: ContentCreateOptions
	): Promise<void>;
	delete?(context: ContentOperationContext, options: ContentDeleteOptions): Promise<void>;
	preview?(
		context: ContentOperationContext,
		data: ContentRecord,
		options?: ContentPreviewOptions
	): Promise<ChangesSummary>;
}
