import { createMarkdownContentComponentArtifacts } from '$lib/content-components/markdown';
import { filterContentComponentRegistry, type ContentComponentRegistry } from '$lib/content-components/registry';
import { dedupeMarkdownFieldToolbarButtons } from '$lib/components/form/markdown-field-ui';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';

export async function loadMarkdownFieldContentComponentState(options: {
	loadRegistry: (
		mode: 'local' | 'github',
		options?: { scopeKey?: string; componentsDir?: string }
	) => Promise<ContentComponentRegistry>;
	componentMode: 'local' | 'github';
	scopeKey: string;
	componentsDir?: string;
	enabledComponentNames?: string[];
	getPreviewRenderOptions: () => {
		contentItem?: object | null;
		referenceIndex?: Map<string, Map<string, unknown>>;
	};
	onComponentClick?: (payload: { componentName: string }) => void;
	resolveReferenceOptions: (input: {
		component: ContentComponentRegistry['components'][number];
		attributeName: string;
		binding: string;
	}) => Array<{ label: string; value: string }>;
}): Promise<{
	availableRegistry: ContentComponentRegistry;
	enabledRegistry: ContentComponentRegistry;
	componentToolbarButtons: ContentComponentToolbarButton[];
	extensions: ReturnType<typeof createMarkdownContentComponentArtifacts>['extensions'];
}> {
	const availableRegistry = await options.loadRegistry(options.componentMode, {
		scopeKey: options.scopeKey,
		componentsDir: options.componentsDir
	});
	const enabledRegistry = filterContentComponentRegistry(
		availableRegistry,
		options.enabledComponentNames
	);
	const contentComponentArtifacts = createMarkdownContentComponentArtifacts(enabledRegistry, {
		getPreviewRenderOptions: options.getPreviewRenderOptions,
		onComponentClick: options.onComponentClick,
		resolveReferenceOptions: options.resolveReferenceOptions
	});

	return {
		availableRegistry,
		enabledRegistry,
		componentToolbarButtons: dedupeMarkdownFieldToolbarButtons(
			contentComponentArtifacts.toolbarItems.map((item) => ({
				...item,
				buttonLabel: item.buttonLabel ?? item.label
			})),
			'last'
		),
		extensions: contentComponentArtifacts.extensions
	};
}
