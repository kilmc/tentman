import type { Editor, Extensions } from '@tiptap/core';

export type PluginCapabilityName = 'markdown' | 'preview';

export interface HtmlInlineNodeAttributeDefinition {
	name: string;
	default?: string;
	parse(element: HTMLElement): string | null | undefined;
}

export interface HtmlInlineNodeRenderResult {
	tag: string;
	attributes: Record<string, string>;
	text: string;
}

export interface HtmlInlineNodeEditorView {
	label(attributes: Record<string, unknown>): string;
	className?: string | ((attributes: Record<string, unknown>) => string | undefined);
}

export interface MarkdownToolbarItemContribution {
	id: string;
	label: string;
	buttonLabel?: string;
	run?(editor: Editor): void;
	isActive?(editor: Editor): boolean;
	dialog?: MarkdownToolbarDialogContribution;
}

export interface MarkdownToolbarDialogFieldOption {
	label: string;
	value: string;
}

export interface MarkdownToolbarDialogField {
	id: string;
	label: string;
	type?: 'text' | 'url' | 'select';
	required?: boolean;
	defaultValue?: string;
	options?: MarkdownToolbarDialogFieldOption[];
}

export interface MarkdownToolbarDialogContribution {
	title: string;
	submitLabel?: string;
	fields: MarkdownToolbarDialogField[];
	getInitialValues?(editor: Editor): Record<string, string>;
	validate?(values: Record<string, string>): string | null | undefined;
	submit(editor: Editor, values: Record<string, string>): void;
}

export interface MarkdownHtmlInlineNodeContribution {
	id: string;
	nodeName: string;
	selector: string;
	attributes: HtmlInlineNodeAttributeDefinition[];
	renderHTML(attributes: Record<string, unknown>): HtmlInlineNodeRenderResult;
	editorView: HtmlInlineNodeEditorView;
	toolbarItems?: MarkdownToolbarItemContribution[];
}

export interface MarkdownPluginCapability {
	htmlInlineNodes?: MarkdownHtmlInlineNodeContribution[];
}

export interface PreviewPluginCapability {
	transformMarkdown?(markdown: string): string;
}

export interface UnifiedLocalPlugin {
	id: string;
	version: string;
	capabilities: readonly PluginCapabilityName[];
	markdown?: MarkdownPluginCapability;
	preview?: PreviewPluginCapability;
}

export interface LoadedSitePlugin {
	id: string;
	path: string;
	plugin: UnifiedLocalPlugin;
}

export interface SitePluginRegistry {
	plugins: LoadedSitePlugin[];
	errors: string[];
	get(id: string): LoadedSitePlugin | undefined;
}

export interface LoadedMarkdownPlugins {
	plugins: LoadedSitePlugin[];
	extensions: Extensions;
	toolbarItems: MarkdownToolbarItemContribution[];
	errors: string[];
}
