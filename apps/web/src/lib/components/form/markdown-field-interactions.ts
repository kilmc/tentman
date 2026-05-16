import { getContentComponentDialogValidationError } from '$lib/content-components/dialog';
import {
	createMarkdownFieldDialogState,
	getMarkdownFieldSerializedDialogValue
} from '$lib/components/form/markdown-field-controller';
import type { MarkdownFieldContentComponentReferenceTarget } from '$lib/components/form/markdown-field-content-component-selection';
import {
	createMarkdownFieldPopoverStateFromRect,
	getMarkdownFieldDialogSubmitLabel,
	getMarkdownFieldDialogTitle,
	type MarkdownFieldContextualPopoverState
} from '$lib/components/form/markdown-field-ui';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { Editor } from '@tiptap/core';

export interface MarkdownFieldComponentDialogState {
	item: ContentComponentToolbarButton | null;
	values: Record<string, string>;
	error: string | null;
	returnFocus: HTMLElement | null;
	mode: 'insert' | 'edit';
}

export interface MarkdownFieldPopoverState {
	popover: MarkdownFieldContextualPopoverState | null;
	open: boolean;
	linkMode: 'view' | 'edit';
	linkValue: string;
	componentEditItem: ContentComponentToolbarButton | null;
	componentReferenceTarget: MarkdownFieldContentComponentReferenceTarget | null;
}

export function createInitialMarkdownFieldComponentDialogState(): MarkdownFieldComponentDialogState {
	return {
		item: null,
		values: {},
		error: null,
		returnFocus: null,
		mode: 'insert'
	};
}

export function createInitialMarkdownFieldPopoverState(): MarkdownFieldPopoverState {
	return {
		popover: null,
		open: false,
		linkMode: 'view',
		linkValue: '',
		componentEditItem: null,
		componentReferenceTarget: null
	};
}

export function getMarkdownFieldComponentDialogTitle(
	state: Pick<MarkdownFieldComponentDialogState, 'item' | 'mode'>
): string {
	return getMarkdownFieldDialogTitle({
		mode: state.mode,
		item: state.item
	});
}

export function getMarkdownFieldComponentDialogSubmitLabel(
	state: Pick<MarkdownFieldComponentDialogState, 'item' | 'mode'>
): string {
	return getMarkdownFieldDialogSubmitLabel({
		mode: state.mode,
		item: state.item
	});
}

export function getMarkdownFieldComponentDialogSerializedValue(
	state: Pick<MarkdownFieldComponentDialogState, 'item' | 'values'>
): string | null {
	return getMarkdownFieldSerializedDialogValue({
		item: state.item,
		values: state.values
	});
}

export function openMarkdownFieldPopoverFromRect(options: {
	kind: MarkdownFieldContextualPopoverState['kind'];
	href: string;
	rect: DOMRect;
	editItem?: ContentComponentToolbarButton | null;
	referenceTarget?: MarkdownFieldContentComponentReferenceTarget | null;
	broken?: boolean;
	startInEditMode?: boolean;
}): MarkdownFieldPopoverState {
	return {
		popover: createMarkdownFieldPopoverStateFromRect({
			kind: options.kind,
			href: options.href,
			rect: options.rect,
			editItem: options.editItem,
			broken: options.broken
		}),
		open: true,
		linkMode: options.kind === 'link' && options.startInEditMode ? 'edit' : 'view',
		linkValue: options.href,
		componentEditItem: options.editItem ?? null,
		componentReferenceTarget: options.referenceTarget ?? null
	};
}

export function startMarkdownFieldLinkEditing(
	state: MarkdownFieldPopoverState,
	destroyed: boolean
): MarkdownFieldPopoverState {
	if (destroyed || !state.popover || state.popover.kind !== 'link') {
		return state;
	}

	return {
		...state,
		linkMode: 'edit',
		linkValue: state.popover.href
	};
}

export function closeMarkdownFieldPopover(): MarkdownFieldPopoverState {
	return createInitialMarkdownFieldPopoverState();
}

export function setMarkdownFieldLinkValue(
	state: MarkdownFieldPopoverState,
	linkValue: string
): MarkdownFieldPopoverState {
	return {
		...state,
		linkValue
	};
}

export function openMarkdownFieldComponentDialog(options: {
	item: ContentComponentToolbarButton;
	editor: Editor;
	trigger?: HTMLElement;
	activeElement?: Element | null;
}): MarkdownFieldComponentDialogState {
	const dialogState = createMarkdownFieldDialogState({
		item: options.item,
		editor: options.editor
	});

	return {
		item: options.item,
		values: dialogState.values,
		error: null,
		returnFocus:
			options.trigger ?? (options.activeElement instanceof HTMLElement ? options.activeElement : null),
		mode: dialogState.mode
	};
}

export function closeMarkdownFieldComponentDialog(
	restoreState: MarkdownFieldComponentDialogState
): {
	state: MarkdownFieldComponentDialogState;
	returnFocus: HTMLElement | null;
} {
	return {
		state: createInitialMarkdownFieldComponentDialogState(),
		returnFocus: restoreState.returnFocus
	};
}

export function setMarkdownFieldComponentDialogValue(options: {
	state: MarkdownFieldComponentDialogState;
	fieldId: string;
	nextValue: string;
}): MarkdownFieldComponentDialogState {
	return {
		...options.state,
		values: {
			...options.state.values,
			[options.fieldId]: options.nextValue
		},
		error: null
	};
}

export function getMarkdownFieldComponentDialogValidationError(
	state: Pick<MarkdownFieldComponentDialogState, 'item' | 'values'>
): string | null {
	if (!state.item?.dialog) {
		return null;
	}

	return getContentComponentDialogValidationError({
		dialog: state.item.dialog,
		values: state.values
	});
}

export function setMarkdownFieldComponentDialogError(
	state: MarkdownFieldComponentDialogState,
	error: string
): MarkdownFieldComponentDialogState {
	return {
		...state,
		error
	};
}
