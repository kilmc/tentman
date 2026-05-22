declare module '@tentman/core/content-components' {
	export interface CoreContentComponentAttributeDefinition {
		type: 'string' | 'enum';
		required?: boolean;
		default?: string;
		options?: string[];
		valueFromMarkdownLabel?: boolean;
		reference?: boolean;
		referenceScope?: {
			preview: 'self' | 'container' | 'full';
			render: 'self' | 'container' | 'full';
		};
		editor?: {
			label?: string;
			control?: 'text' | 'url' | 'select';
			hidden?: boolean;
		};
	}

	export interface CoreLoadedContentComponent {
		directory: string;
		componentJsonPath: string;
		renderTemplatePath: string;
		previewTemplatePath: string;
		renderTemplateSource: string;
		previewTemplateSource: string;
		definition: {
			id: string;
			name: string;
			kind: 'inline' | 'block';
			attributes: Record<string, CoreContentComponentAttributeDefinition>;
			editor?: {
				toolbarLabel?: string;
				dialogTitle?: string;
				submitLabel?: string;
			};
			render?: Record<
				string,
				{
					from: string;
					component: string;
					props: Record<string, string>;
				}
			>;
		};
	}

	export interface CoreNormalizedContentComponentInstance {
		componentId: string;
		componentName: string;
		kind: 'inline' | 'block';
		attributes: Record<string, string>;
	}

	export interface CoreContentComponentReferenceEntry {
		binding: string;
		token: string;
		field: string;
		self: unknown;
		container: unknown;
		full: unknown;
	}

	export interface CoreContentComponentPreviewDiagnostic {
		kind: 'tag' | 'attribute' | 'img-src';
		tagName: string;
		attributeName?: string;
		value?: string;
		message: string;
	}

	export function collectContentComponents(
		components: Array<
			Omit<CoreLoadedContentComponent, 'definition'> & {
				definition: unknown;
			}
		>,
		options?: { onError?: 'throw' | 'warn' }
	): CoreLoadedContentComponent[];

	export function normalizeContentComponentInstance(
		component: CoreLoadedContentComponent,
		input?: {
			markdownLabel?: string | null;
			attributes?: Record<string, string | null | undefined>;
		}
	): CoreNormalizedContentComponentInstance;

	export function renderContentComponent(
		component: CoreLoadedContentComponent,
		instance: CoreNormalizedContentComponentInstance,
		mode: 'render' | 'preview',
		options?: {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		}
	): string;

	export function sanitizeContentComponentPreviewHtml(html: string): {
		html: string;
		diagnostics: CoreContentComponentPreviewDiagnostic[];
	};

	export function inspectContentComponentPreviewTemplateSource(source: string): {
		html: string;
		diagnostics: CoreContentComponentPreviewDiagnostic[];
	};

	export function getContentComponentReferenceAttribute(component: CoreLoadedContentComponent): {
		attributeId: string;
		definition: CoreContentComponentAttributeDefinition;
		binding: string;
	} | null;

	export function getContentComponentReferenceScope(
		component: CoreLoadedContentComponent,
		mode: 'preview' | 'render'
	): 'self' | 'container' | 'full' | null;

	export function getContentComponentRenderTarget(
		component: CoreLoadedContentComponent,
		target: string
	): {
		from: string;
		component: string;
		props: Record<string, string>;
	} | null;

	export function collectContentComponentReferenceIndex<
		TBlock extends {
			id?: string;
			collection?: unknown;
			referenceFor?: string | string[];
		}
	>(options: {
		blocks: TBlock[];
		contentItem: object;
		resolveStructuredBlocks: (block: TBlock) => TBlock[] | null;
	}): {
		referenceIndex: Map<string, Map<string, CoreContentComponentReferenceEntry>>;
		errors: string[];
	};

	export function resolveContentComponentInstance(
		component: CoreLoadedContentComponent,
		instance: CoreNormalizedContentComponentInstance,
		mode: 'preview' | 'render',
		options?: {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		}
	): {
		attributes: Record<string, string>;
		data: unknown;
	};

	export function resolveContentComponentRenderTarget(
		component: CoreLoadedContentComponent,
		instance: CoreNormalizedContentComponentInstance,
		target: string,
		options?: {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		}
	): {
		from: string;
		component: string;
		props: Record<string, unknown>;
	} | null;

	export function validateContentComponentInstance(
		component: CoreLoadedContentComponent,
		instance: CoreNormalizedContentComponentInstance,
		options?: {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		}
	): string[];
}
