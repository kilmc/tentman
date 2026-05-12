import { getMarkdownFieldContextualPopoverState } from '$lib/components/form/markdown-field-controller';
import {
	closeMarkdownFieldPopover,
	openMarkdownFieldPopoverFromRect,
	startMarkdownFieldLinkEditing,
	type MarkdownFieldPopoverState
} from '$lib/components/form/markdown-field-interactions';
import {
	getMarkdownFieldPopoverAnchorStyle,
	getMarkdownFieldSelectionRect
} from '$lib/components/form/markdown-field-ui';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { Editor } from '@tiptap/core';

export function createMarkdownFieldLinkPopoverState(options: {
	editor: Editor;
	href: string;
	destroyed: boolean;
	startInEditMode?: boolean;
}): MarkdownFieldPopoverState | null {
	const rect = getMarkdownFieldSelectionRect(options.editor);
	if (!rect) {
		return null;
	}

	const popoverState = openMarkdownFieldPopoverFromRect({
		kind: 'link',
		href: options.href,
		rect,
		startInEditMode: options.startInEditMode
	});

	return options.startInEditMode
		? startMarkdownFieldLinkEditing(popoverState, options.destroyed)
		: popoverState;
}

export type MarkdownFieldEditorHostClickResult =
	| { kind: 'ignore' }
	| { kind: 'open-dialog'; item: ContentComponentToolbarButton }
	| { kind: 'open-popover'; state: MarkdownFieldPopoverState };

export function getMarkdownFieldEditorHostClickResult(options: {
	event: MouseEvent;
	hasOpenDialog: boolean;
	destroyed: boolean;
	editor: Editor | null;
	componentToolbarButtons: ContentComponentToolbarButton[];
}): MarkdownFieldEditorHostClickResult {
	if (options.event.metaKey || options.event.ctrlKey || options.hasOpenDialog) {
		return { kind: 'ignore' };
	}

	const target = options.event.target;
	if (
		target instanceof Element &&
		target.closest('a[href]') &&
		!target.closest('[data-tentman-content-component-node]')
	) {
		return { kind: 'ignore' };
	}

	if (options.destroyed || !options.editor) {
		return { kind: 'ignore' };
	}

	const nextPopover = getMarkdownFieldContextualPopoverState({
		editor: options.editor,
		componentToolbarButtons: options.componentToolbarButtons
	});
	if (!nextPopover) {
		return { kind: 'ignore' };
	}

	if (
		nextPopover.kind === 'component' &&
		(nextPopover.broken || !nextPopover.href) &&
		nextPopover.editItem
	) {
		return {
			kind: 'open-dialog',
			item: nextPopover.editItem
		};
	}

	return {
		kind: 'open-popover',
		state:
			nextPopover.kind === 'link'
				? startMarkdownFieldLinkEditing(
						{
							popover: nextPopover,
							open: true,
							linkMode: 'view',
							linkValue: nextPopover.href
						},
						options.destroyed
					)
				: {
						popover: nextPopover,
						open: true,
						linkMode: 'view',
						linkValue: nextPopover.href
					}
	};
}

export function getMarkdownFieldRichShellPopover(
	popoverState: MarkdownFieldPopoverState
): {
	kind: 'link' | 'component';
	href: string;
	placement: 'above' | 'below';
	editLabel: string;
} | null {
	if (!popoverState.popover) {
		return null;
	}

	return {
		kind: popoverState.popover.kind,
		href: popoverState.popover.href,
		placement: popoverState.popover.placement,
		editLabel: popoverState.popover.editItem?.buttonLabel?.toLowerCase() ?? 'item'
	};
}

export function getMarkdownFieldRichShellPopoverAnchorStyle(
	popoverState: MarkdownFieldPopoverState
): string {
	return popoverState.popover ? getMarkdownFieldPopoverAnchorStyle(popoverState.popover) : '';
}

export function closeMarkdownFieldPopoverIfNeeded(nextOpen: boolean): MarkdownFieldPopoverState | null {
	return nextOpen ? null : closeMarkdownFieldPopover();
}
