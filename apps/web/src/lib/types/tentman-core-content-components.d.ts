declare module '@tentman/core/content-components' {
	export interface CoreContentComponentAttributeDefinition {
		type: 'string' | 'enum';
		required?: boolean;
		default?: string;
		options?: string[];
		valueFromMarkdownLabel?: boolean;
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
		};
	}

	export interface CoreNormalizedContentComponentInstance {
		componentId: string;
		componentName: string;
		kind: 'inline' | 'block';
		attributes: Record<string, string>;
	}

	export function collectContentComponents(
		components: CoreLoadedContentComponent[],
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
		mode: 'render' | 'preview'
	): string;
}
