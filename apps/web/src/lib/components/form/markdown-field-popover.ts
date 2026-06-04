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
import type { MarkdownFieldSelectedContentComponentState } from '$lib/components/form/markdown-field-content-component-selection';
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
	| { kind: 'open-popover'; state: MarkdownFieldPopoverState };

function createMarkdownFieldPopoverStateFromContext(options: {
	popover: NonNullable<MarkdownFieldPopoverState['popover']>;
	destroyed: boolean;
	selectedContentComponentState: MarkdownFieldSelectedContentComponentState | null;
}): MarkdownFieldPopoverState {
	if (options.popover.kind === 'link') {
		return startMarkdownFieldLinkEditing(
			{
				popover: options.popover,
				open: true,
				linkMode: 'view',
				linkValue: options.popover.href,
				componentEditItem: null,
				componentReferenceTarget: null
			},
			options.destroyed
		);
	}

	return {
		popover: options.popover,
		open: true,
		linkMode: 'view',
		linkValue: options.popover.href,
		componentEditItem: options.popover.editItem,
		componentReferenceTarget:
			options.selectedContentComponentState?.primaryAction === 'openActions'
				? options.selectedContentComponentState.referenceTarget
				: null
	};
}

export function getMarkdownFieldEditorHostClickResult(options: {
	event: MouseEvent;
	hasOpenDialog: boolean;
	destroyed: boolean;
	editor: Editor | null;
	selectedContentComponentState: MarkdownFieldSelectedContentComponentState | null;
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
		selectedContentComponentState: options.selectedContentComponentState
	});
	if (!nextPopover) {
		return { kind: 'ignore' };
	}

	return {
		kind: 'open-popover',
		state: createMarkdownFieldPopoverStateFromContext({
			popover: nextPopover,
			destroyed: options.destroyed,
			selectedContentComponentState: options.selectedContentComponentState
		})
	};
}

export function getMarkdownFieldRichShellPopover(popoverState: MarkdownFieldPopoverState): {
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
		editLabel:
			popoverState.componentEditItem?.buttonLabel?.toLowerCase() ??
			popoverState.componentEditItem?.label?.toLowerCase() ??
			'item'
	};
}

export function getMarkdownFieldRichShellPopoverAnchorStyle(
	popoverState: MarkdownFieldPopoverState
): string {
	return popoverState.popover ? getMarkdownFieldPopoverAnchorStyle(popoverState.popover) : '';
}
