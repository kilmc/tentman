import type { Editor } from '@tiptap/core';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { MarkdownToolbarDialogContribution } from '$lib/features/markdown-editor/types';

export interface MarkdownFieldContextualPopoverState {
	kind: 'link' | 'component';
	href: string;
	top: number;
	left: number;
	placement: 'above' | 'below';
	broken: boolean;
	editItem: ContentComponentToolbarButton | null;
}

export function normalizeMarkdownFieldHref(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

export function getMarkdownFieldDialogTitle(options: {
	mode: 'insert' | 'edit';
	item: { dialog?: MarkdownToolbarDialogContribution | null } | null;
}): string {
	if (!options.item?.dialog) {
		return '';
	}

	return options.mode === 'edit'
		? `Edit ${options.item.dialog.title}`
		: `Insert ${options.item.dialog.title}`;
}

export function getMarkdownFieldDialogSubmitLabel(options: {
	mode: 'insert' | 'edit';
	item: { dialog?: MarkdownToolbarDialogContribution | null } | null;
}): string {
	if (!options.item?.dialog) {
		return 'Insert';
	}

	if (options.item.dialog.submitLabel) {
		return options.item.dialog.submitLabel;
	}

	return options.mode === 'edit' ? 'Save changes' : 'Insert';
}

export function getMarkdownFieldSelectionRect(editor: Editor): DOMRect | null {
	const { from, to } = editor.state.selection;

	try {
		const start = editor.view.coordsAtPos(from);
		const end = editor.view.coordsAtPos(to);
		const left = Math.min(start.left, end.left);
		const right = Math.max(start.right, end.right);
		const top = Math.min(start.top, end.top);
		const bottom = Math.max(start.bottom, end.bottom);

		return new DOMRect(left, top, Math.max(right - left, 1), Math.max(bottom - top, 1));
	} catch {
		return null;
	}
}

export function getMarkdownFieldPopoverPosition(
	rect: DOMRect
): Pick<MarkdownFieldContextualPopoverState, 'top' | 'left' | 'placement'> {
	const prefersAbove = rect.top > 140;
	const viewportPadding = 16;

	return {
		top: prefersAbove ? rect.top - 12 : rect.bottom + 12,
		left: Math.min(
			Math.max(rect.left + rect.width / 2, viewportPadding),
			window.innerWidth - viewportPadding
		),
		placement: prefersAbove ? 'above' : 'below'
	};
}

export function createMarkdownFieldPopoverStateFromRect(options: {
	kind: MarkdownFieldContextualPopoverState['kind'];
	href: string;
	rect: DOMRect;
	editItem?: ContentComponentToolbarButton | null;
	broken?: boolean;
}): MarkdownFieldContextualPopoverState {
	return {
		kind: options.kind,
		href: options.href,
		broken: options.broken ?? false,
		editItem: options.editItem ?? null,
		...getMarkdownFieldPopoverPosition(options.rect)
	};
}

export function dedupeMarkdownFieldToolbarButtons(
	items: ContentComponentToolbarButton[],
	preferred: 'first' | 'last' = 'last'
): ContentComponentToolbarButton[] {
	const byId = new Map<string, ContentComponentToolbarButton>();
	const orderedItems = preferred === 'last' ? items : [...items].reverse();

	for (const item of orderedItems) {
		if (!byId.has(item.id)) {
			byId.set(item.id, item);
		}
	}

	return preferred === 'last' ? Array.from(byId.values()) : Array.from(byId.values()).reverse();
}

export function getMarkdownFieldPopoverAnchorStyle(
	popover: Pick<MarkdownFieldContextualPopoverState, 'left' | 'top' | 'placement'>
): string {
	return `left:${popover.left}px;top:${popover.placement === 'above' ? popover.top : popover.top - 1}px;`;
}
