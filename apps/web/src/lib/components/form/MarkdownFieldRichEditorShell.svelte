<script lang="ts">
	import MarkdownContentComponentDialog from '$lib/components/form/MarkdownContentComponentDialog.svelte';
	import MarkdownContextualPopover from '$lib/components/form/MarkdownContextualPopover.svelte';
	import MarkdownRichToolbar from '$lib/components/form/MarkdownRichToolbar.svelte';
	import type {
		ActionToolbarButton,
		ContentComponentToolbarButton,
		InlineFormatValue,
		InlineToggleButton,
		ListOption,
		ListValue,
		StructureOption,
		StructureValue
	} from '$lib/components/form/markdown-field-toolbar';
	import type { MarkdownToolbarDialogContribution } from '$lib/features/markdown-editor/types';
	import type { Editor } from '@tiptap/core';

	interface ContextualPopoverViewModel {
		kind: 'link' | 'component';
		href: string;
		placement: 'above' | 'below';
		editLabel: string;
	}

	interface Props {
		toolbarDisabled: boolean;
		activeStructureValue: StructureValue;
		activeStructureOption: StructureOption;
		activeListValue: ListValue;
		activeListIcon: 'bulletList' | 'orderedList';
		activeInlineValues: InlineFormatValue[];
		structureOptions: StructureOption[];
		listOptions: ListOption[];
		inlineToggleButtons: InlineToggleButton[];
		actionButtons: ActionToolbarButton[];
		componentToolbarButtons: ContentComponentToolbarButton[];
		editorLoadError?: string | null;
		hasRichEditor: boolean;
		isInvalid: boolean;
		editorHost?: HTMLDivElement | null;
		fileInput?: HTMLInputElement | null;
		contextualPopoverAnchor?: HTMLDivElement | null;
		contextualPopover?: ContextualPopoverViewModel | null;
		contextualPopoverOpen: boolean;
		contextualPopoverAnchorStyle?: string;
		linkMode: 'view' | 'edit';
		linkValue: string;
		componentJumpLabel?: string | null;
		componentDialog?: MarkdownToolbarDialogContribution | null;
		componentDialogTitle?: string;
		componentDialogSubmitLabel?: string;
		componentDialogValues?: Record<string, string>;
		componentDialogSerializedValue?: string | null;
		componentDialogValidationError?: string | null;
		istoolbaritemactive: (item: {
			isActive?: ((editor: Editor) => boolean) | undefined;
		}) => boolean;
		onapplystructurevalue: (value: StructureValue) => void;
		onapplylistvalue: (value: ListValue) => void;
		onhandleinlineformatchange: (values: string[]) => void;
		onactivatetoolbaritem: (
			item: ActionToolbarButton | InlineToggleButton | ContentComponentToolbarButton,
			trigger?: HTMLElement
		) => void;
		onimagefilesselected: (files: File[], input: HTMLInputElement) => void | Promise<void>;
		oneditorhostclick: (event: MouseEvent) => void;
		oncontextualpopoveropenchange: (open: boolean) => void;
		onlinkvaluechange: (value: string) => void;
		onstartlinkedit: () => void;
		onsubmitlinkedit: () => void;
		oncancellinkedit: () => void;
		onedittarget: () => void;
		onjumptarget: () => void;
		onopencurrenthref: () => void;
		onremovecurrentlink: () => void;
		onclosecomponentdialog: () => void;
		onsubmitcomponentdialog: () => void;
		oncomponentdialogvaluechange: (fieldId: string, value: string) => void;
	}

	let {
		toolbarDisabled,
		activeStructureValue,
		activeStructureOption,
		activeListValue,
		activeListIcon,
		activeInlineValues,
		structureOptions,
		listOptions,
		inlineToggleButtons,
		actionButtons,
		componentToolbarButtons,
		editorLoadError = null,
		hasRichEditor,
		isInvalid,
		editorHost = $bindable(null),
		fileInput = $bindable(null),
		contextualPopoverAnchor = $bindable(null),
		contextualPopover = null,
		contextualPopoverOpen,
		contextualPopoverAnchorStyle = '',
		linkMode,
		linkValue,
		componentJumpLabel = null,
		componentDialog = null,
		componentDialogTitle = '',
		componentDialogSubmitLabel = 'Insert',
		componentDialogValues = {},
		componentDialogSerializedValue = null,
		componentDialogValidationError = null,
		istoolbaritemactive,
		onapplystructurevalue,
		onapplylistvalue,
		onhandleinlineformatchange,
		onactivatetoolbaritem,
		onimagefilesselected,
		oneditorhostclick,
		oncontextualpopoveropenchange,
		onlinkvaluechange,
		onstartlinkedit,
		onsubmitlinkedit,
		oncancellinkedit,
		onedittarget,
		onjumptarget,
		onopencurrenthref,
		onremovecurrentlink,
		onclosecomponentdialog,
		onsubmitcomponentdialog,
		oncomponentdialogvaluechange
	}: Props = $props();
</script>

<div
	class="overflow-hidden rounded border bg-white"
	class:border-red-300={isInvalid}
	class:border-gray-300={!isInvalid}
>
	<MarkdownRichToolbar
		{toolbarDisabled}
		{activeStructureValue}
		{activeStructureOption}
		{activeListValue}
		{activeListIcon}
		{activeInlineValues}
		{structureOptions}
		{listOptions}
		{inlineToggleButtons}
		{actionButtons}
		{componentToolbarButtons}
		istoolbaritemactive={istoolbaritemactive}
		onapplystructurevalue={onapplystructurevalue}
		onapplylistvalue={onapplylistvalue}
		onhandleinlineformatchange={onhandleinlineformatchange}
		onactivatetoolbaritem={onactivatetoolbaritem}
	/>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		data-testid="markdown-image-input"
		class="hidden"
		onchange={(event) => {
			const input = event.currentTarget as HTMLInputElement;
			const files = Array.from(input.files ?? []);
			void onimagefilesselected(files, input);
		}}
	/>

	{#if editorLoadError}
		<div class="px-4 py-3 text-sm text-red-700">{editorLoadError}</div>
	{:else if !hasRichEditor}
		<div class="px-4 py-3 text-sm text-gray-500">Loading rich editor...</div>
	{/if}

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={editorHost}
		class="min-h-0"
		data-testid="markdown-rich-editor"
		onclick={oneditorhostclick}
	></div>
</div>

{#if contextualPopover && contextualPopoverOpen}
	<div
		bind:this={contextualPopoverAnchor}
		aria-hidden="true"
		class="pointer-events-none fixed h-px w-px"
		style={contextualPopoverAnchorStyle}
	></div>

	<MarkdownContextualPopover
		open={contextualPopoverOpen}
		anchor={contextualPopoverAnchor}
		popover={contextualPopover}
		linkMode={linkMode}
		linkValue={linkValue}
		{componentJumpLabel}
		onopenchange={oncontextualpopoveropenchange}
		onlinkvaluechange={onlinkvaluechange}
		onstartlinkedit={onstartlinkedit}
		onsubmitlinkedit={onsubmitlinkedit}
		oncancellinkedit={oncancellinkedit}
		onedittarget={onedittarget}
		onjumptarget={onjumptarget}
		onopencurrenthref={onopencurrenthref}
		onremovecurrentlink={onremovecurrentlink}
	/>
{/if}

<p class="mt-1 text-xs text-gray-500">
	Rich editing is client-only. Images are staged locally until you explicitly save. Use Cmd + click
	to open a selected link.
</p>

{#if componentDialog}
	<MarkdownContentComponentDialog
		dialog={componentDialog}
		title={componentDialogTitle}
		submitLabel={componentDialogSubmitLabel}
		values={componentDialogValues}
		serializedValue={componentDialogSerializedValue}
		validationError={componentDialogValidationError}
		onclose={onclosecomponentdialog}
		onsubmit={onsubmitcomponentdialog}
		onvaluechange={oncomponentdialogvaluechange}
	/>
{/if}

<style>
	:global(.markdown-editor-content pre) {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		line-height: 1.6;
		tab-size: 2;
	}

	:global(.markdown-editor-content pre code) {
		font: inherit;
		background: transparent;
		padding: 0;
		border-radius: 0;
	}

	:global(.markdown-editor-content) {
		min-height: 14rem;
		padding: 0.875rem 0.875rem 1rem;
	}

	:global(.markdown-editor-content hr) {
		margin-block: 1rem;
	}

	:global(.markdown-editor-content p) {
		margin-block: 0.75rem;
	}

	:global(.markdown-editor-content .markdown-editor-image-node) {
		width: 100%;
	}

	:global(.markdown-editor-content .ProseMirror-selectednode) {
		outline: 2px solid rgb(168 162 158 / 0.9);
		outline-offset: 2px;
	}

	:global(.markdown-editor-content > :first-child) {
		margin-top: 0;
	}

	:global(.markdown-editor-content > :last-child) {
		margin-bottom: 0;
	}

	@media (min-width: 640px) {
		:global(.markdown-editor-content) {
			min-height: 16rem;
			padding: 0.75rem 1rem;
		}
	}

	@media (min-width: 1024px) {
		:global(.markdown-editor-content) {
			min-height: 20rem;
			padding: 1rem 1.25rem 1.25rem;
		}
	}
</style>
