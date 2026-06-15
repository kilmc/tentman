export type ContentComponentKind = 'inline' | 'block';
export type ContentComponentAttributeType = 'string' | 'enum';
export type ContentComponentReferenceScope = 'self' | 'container' | 'full';

export interface ContentComponentAttributeDefinition {
	type: ContentComponentAttributeType;
	required: boolean;
	valueFromMarkdownLabel: boolean;
	reference?: boolean;
	referenceScope?: ContentComponentReferenceScope;
	default?: string;
	options?: string[];
	editor?: {
		label?: string;
		control?: 'text' | 'url' | 'select';
		hidden?: boolean;
	};
}

export interface ContentComponentDefinition {
	id: string;
	name: string;
	kind: ContentComponentKind;
	attributes: Record<string, ContentComponentAttributeDefinition>;
	render?: Record<
		string,
		{
			from: string;
			component: string;
			props: Record<string, unknown>;
		}
	>;
}

export interface ContentComponent {
	directory: string;
	componentJsonPath: string;
	renderTemplatePath: string;
	renderTemplate: string;
	definition: ContentComponentDefinition;
}

export interface ContentComponentInstance {
	name: string;
	markdownLabel?: string;
	attributes: Record<string, string>;
	data?: Record<string, unknown>;
}

export interface ContentComponentRenderTarget {
	from: string;
	component: string;
	props: Record<string, unknown>;
}

export interface ContentComponentReferenceIndexEntry {
	componentId: string;
	attributeId: string;
	token: string;
	value: unknown;
}

export function discoverContentComponents(options: { componentsDir: string }): Promise<ContentComponent[]>;
export function collectContentComponents(options: { componentsDir: string }): Promise<ContentComponent[]>;
export function loadContentComponent(componentDir: string): Promise<ContentComponent>;
export function validateContentComponent(component: ContentComponent): ContentComponent;
export function normalizeContentComponentInstance(
	component: ContentComponent,
	instance: Partial<ContentComponentInstance>
): ContentComponentInstance;
export function validateContentComponentInstance(
	component: ContentComponent,
	instance: ContentComponentInstance
): void;
export function resolveContentComponentInstance(
	component: ContentComponent,
	instance: ContentComponentInstance,
	options?: Record<string, unknown>
): ContentComponentInstance;
export function getContentComponentReferenceAttribute(
	component: ContentComponent,
	attributeId?: string
): ContentComponentAttributeDefinition | null;
export function getContentComponentReferenceScope(
	component: ContentComponent,
	attributeId?: string
): ContentComponentReferenceScope | null;
export function collectContentComponentReferenceIndex(
	options: Record<string, unknown>
): ContentComponentReferenceIndexEntry[];
export function getContentComponentRenderTarget(
	component: ContentComponent,
	target: string
): ContentComponentRenderTarget | null;
export function resolveContentComponentRenderTarget(
	component: ContentComponent,
	instance: ContentComponentInstance,
	target: string,
	options?: Record<string, unknown>
): ContentComponentRenderTarget | null;

