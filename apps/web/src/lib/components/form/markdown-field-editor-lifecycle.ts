import {
	createMarkdownEditor,
	type MarkdownEditorController
} from '$lib/features/markdown-editor/create-editor';
import type { MarkdownEditorContentComponentActivationRequest } from '$lib/features/markdown-editor/content-component-interactions';
import { loadMarkdownFieldContentComponentState } from '$lib/components/form/markdown-field-content-components';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { MarkdownFieldReferenceState } from '$lib/components/form/markdown-field-context';

interface SetupMarkdownFieldRichEditorOptions {
	editorHost: HTMLDivElement;
	markdown: string;
	placeholder?: string;
	assetsDir?: string;
	storagePath?: string;
	loadRegistry: (
		mode: 'local' | 'github',
		options?: { scopeKey?: string; componentsDir?: string }
	) => Promise<ContentComponentRegistry>;
	componentMode: 'local' | 'github';
	scopeKey: string;
	componentsDir?: string;
	enabledComponentNames?: string[];
	getContentItem: () => object | null;
	getReferenceState: () => MarkdownFieldReferenceState | null;
	resolveReferenceOptions: (binding: string) => Array<{ label: string; value: string }>;
	stageImage: (file: File) => Promise<{ ref: string }>;
	onLinkClick: (payload: { href: string; rect: DOMRect }) => void;
	onContentComponentActivate: (payload: MarkdownEditorContentComponentActivationRequest) => void;
	onMarkdownChange: (markdown: string) => void;
	onUiChange: () => void;
	onError: (message: string) => void;
}

export async function setupMarkdownFieldRichEditor(
	options: SetupMarkdownFieldRichEditorOptions
): Promise<{
	availableRegistry: ContentComponentRegistry;
	enabledRegistry: ContentComponentRegistry;
	componentToolbarButtons: ContentComponentToolbarButton[];
	richEditor: MarkdownEditorController;
}> {
	const contentComponentState = await loadMarkdownFieldContentComponentState({
		loadRegistry: options.loadRegistry,
		componentMode: options.componentMode,
		scopeKey: options.scopeKey,
		componentsDir: options.componentsDir,
		enabledComponentNames: options.enabledComponentNames,
		getPreviewRenderOptions() {
			const referenceState = options.getReferenceState();
			return {
				contentItem: options.getContentItem(),
				referenceIndex: referenceState?.referenceIndex ?? new Map()
			};
		},
		resolveReferenceOptions({ binding }) {
			return options.resolveReferenceOptions(binding);
		}
	});

	const richEditor = createMarkdownEditor({
		markdown: options.markdown,
		placeholder: options.placeholder,
		assetsDir: options.assetsDir,
		storagePath: options.storagePath,
		extensions: [...contentComponentState.extensions],
		contentComponentToolbarButtons: contentComponentState.componentToolbarButtons,
		stageImage: options.stageImage,
		onLinkClick: options.onLinkClick,
		onContentComponentActivate: options.onContentComponentActivate,
		onMarkdownChange: options.onMarkdownChange,
		onUiChange: options.onUiChange,
		onError: options.onError
	});
	richEditor.editor.mount(options.editorHost);

	return {
		availableRegistry: contentComponentState.availableRegistry,
		enabledRegistry: contentComponentState.enabledRegistry,
		componentToolbarButtons: contentComponentState.componentToolbarButtons,
		richEditor
	};
}

export function syncMarkdownFieldRichEditorMarkdown(
	richEditor: MarkdownEditorController | null,
	markdown: string
) {
	richEditor?.setMarkdown(markdown);
}

export function destroyMarkdownFieldRichEditor(richEditor: MarkdownEditorController | null) {
	richEditor?.destroy();
}
