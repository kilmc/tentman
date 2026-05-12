import { buildContentComponentDialogValues } from '$lib/content-components/dialog';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import {
	createMarkdownFieldPopoverStateFromRect,
	getMarkdownFieldSelectionRect,
	normalizeMarkdownFieldHref,
	type MarkdownFieldContextualPopoverState
} from '$lib/components/form/markdown-field-ui';
import type { Editor } from '@tiptap/core';

export function getMarkdownFieldSerializedDialogValue(options: {
	item: ContentComponentToolbarButton | null;
	values: Record<string, string>;
}): string | null {
	if (!options.item?.dialog?.serialize) {
		return null;
	}

	try {
		return options.item.dialog.serialize(options.values) ?? null;
	} catch {
		return null;
	}
}

export function createMarkdownFieldDialogState(options: {
	item: ContentComponentToolbarButton;
	editor: Editor;
}): {
	mode: 'insert' | 'edit';
	values: Record<string, string>;
} {
	return {
		mode: options.item.isActive?.(options.editor) ? 'edit' : 'insert',
		values: buildContentComponentDialogValues({
			dialog: options.item.dialog!,
			initialValues: options.item.dialog?.getInitialValues?.(options.editor) ?? {}
		})
	};
}

export function getMarkdownFieldActiveContentComponentToolbarButton(
	editor: Editor,
	componentToolbarButtons: ContentComponentToolbarButton[]
): ContentComponentToolbarButton | null {
	return componentToolbarButtons.find((item) => item.dialog && item.isActive?.(editor)) ?? null;
}

export function getMarkdownFieldContextualPopoverState(options: {
	editor: Editor;
	componentToolbarButtons: ContentComponentToolbarButton[];
}): MarkdownFieldContextualPopoverState | null {
	const selection = options.editor.state.selection as {
		from: number;
		node?: {
			attrs?: Record<string, unknown>;
		};
	};
	const nodeHref = normalizeMarkdownFieldHref(selection.node?.attrs?.href);

	if (selection.node) {
		const nodeDom = options.editor.view.nodeDOM(selection.from);
		const rect = nodeDom instanceof Element ? nodeDom.getBoundingClientRect() : null;
		if (!rect) {
			return null;
		}

		const editItem = getMarkdownFieldActiveContentComponentToolbarButton(
			options.editor,
			options.componentToolbarButtons
		);
		if (editItem) {
			const broken =
				nodeDom instanceof HTMLElement
					? nodeDom.dataset.tentmanContentComponentBroken === 'true'
					: false;
			return createMarkdownFieldPopoverStateFromRect({
				kind: 'component',
				href: nodeHref,
				rect,
				editItem,
				broken
			});
		}
	}

	if (!options.editor.isActive('link')) {
		return null;
	}

	const href = normalizeMarkdownFieldHref(options.editor.getAttributes('link').href);
	if (!href) {
		return null;
	}

	const rect = getMarkdownFieldSelectionRect(options.editor);
	if (!rect) {
		return null;
	}

	return createMarkdownFieldPopoverStateFromRect({
		kind: 'link',
		href,
		rect
	});
}
