import {
	getMarkdownFieldComponentDialogSerializedValue,
	getMarkdownFieldComponentDialogSubmitLabel,
	getMarkdownFieldComponentDialogTitle,
	getMarkdownFieldComponentDialogValidationError,
	type MarkdownFieldComponentDialogState,
	type MarkdownFieldPopoverState
} from '$lib/components/form/markdown-field-interactions';
import {
	getMarkdownFieldRichShellPopover,
	getMarkdownFieldRichShellPopoverAnchorStyle
} from '$lib/components/form/markdown-field-popover';

export function getMarkdownFieldDialogViewModel(state: MarkdownFieldComponentDialogState): {
	title: string;
	submitLabel: string;
	serializedValue: string | null;
	validationError: string | null;
} {
	return {
		title: getMarkdownFieldComponentDialogTitle(state),
		submitLabel: getMarkdownFieldComponentDialogSubmitLabel(state),
		serializedValue: getMarkdownFieldComponentDialogSerializedValue(state),
		validationError: state.error ?? getMarkdownFieldComponentDialogValidationError(state)
	};
}

export function getMarkdownFieldRichShellViewModel(popoverState: MarkdownFieldPopoverState): {
	contextualPopover: {
		kind: 'link' | 'component';
		href: string;
		placement: 'above' | 'below';
		editLabel: string;
	} | null;
	contextualPopoverAnchorStyle: string;
} {
	return {
		contextualPopover: getMarkdownFieldRichShellPopover(popoverState),
		contextualPopoverAnchorStyle: getMarkdownFieldRichShellPopoverAnchorStyle(popoverState)
	};
}
