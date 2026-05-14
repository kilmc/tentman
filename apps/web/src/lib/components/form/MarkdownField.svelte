<script lang="ts">
	import { getContext, hasContext, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/state';
	import { loadContentComponentRegistryForMode } from '$lib/content-components/browser';
	import type { ContentComponentRegistry } from '$lib/content-components/registry';
	import MarkdownFieldAlerts from '$lib/components/form/MarkdownFieldAlerts.svelte';
	import MarkdownFieldHeader from '$lib/components/form/MarkdownFieldHeader.svelte';
	import MarkdownFieldPlainTextarea from '$lib/components/form/MarkdownFieldPlainTextarea.svelte';
	import MarkdownFieldRichEditorShell from '$lib/components/form/MarkdownFieldRichEditorShell.svelte';
	import {
		getMarkdownFieldActiveRootConfig,
		getMarkdownFieldContentItem,
		getNextMarkdownFieldValidationState,
		getMarkdownFieldReferenceOptions,
		collectMarkdownFieldReferenceState,
		getMarkdownFieldValidationMode,
		resolveMarkdownFieldComponentEnvironment,
		type MarkdownFieldReferenceState
	} from '$lib/components/form/markdown-field-context';
	import {
		queueMarkdownFieldDraftCleanup,
		stageMarkdownFieldImage
	} from '$lib/components/form/markdown-field-draft-assets';
	import {
		destroyMarkdownFieldRichEditor,
		setupMarkdownFieldRichEditor,
		syncMarkdownFieldRichEditorMarkdown
	} from '$lib/components/form/markdown-field-editor-lifecycle';
	import {
		closeMarkdownFieldComponentDialog,
		closeMarkdownFieldPopover,
		createInitialMarkdownFieldComponentDialogState,
		createInitialMarkdownFieldPopoverState,
		getMarkdownFieldComponentDialogSerializedValue,
		getMarkdownFieldComponentDialogSubmitLabel,
		getMarkdownFieldComponentDialogTitle,
		getMarkdownFieldComponentDialogValidationError,
		openMarkdownFieldComponentDialog,
		openMarkdownFieldPopoverFromRect,
		setMarkdownFieldComponentDialogError,
		setMarkdownFieldComponentDialogValue,
		setMarkdownFieldLinkValue,
		startMarkdownFieldLinkEditing
	} from '$lib/components/form/markdown-field-interactions';
	import { createMarkdownFieldToolbarConfig } from '$lib/components/form/markdown-field-toolbar-config';
	import {
		getMarkdownFieldActiveInlineFormatValues,
		getMarkdownFieldActiveListValue,
		getMarkdownFieldActiveStructureValue,
	} from '$lib/components/form/markdown-field-toolbar-state';
	import {
		activateMarkdownFieldToolbarItem,
		applyMarkdownFieldInlineFormatChange,
		applyMarkdownFieldListValue,
		applyMarkdownFieldStructureValue,
		isMarkdownFieldToolbarItemActive
	} from '$lib/components/form/markdown-field-toolbar-actions';
	import {
		normalizeMarkdownFieldHref,
	} from '$lib/components/form/markdown-field-ui';
	import { getMarkdownFieldContextualPopoverState } from '$lib/components/form/markdown-field-controller';
	import {
		closeMarkdownFieldPopoverIfNeeded,
		createMarkdownFieldLinkPopoverState,
		getMarkdownFieldEditorHostClickResult,
	} from '$lib/components/form/markdown-field-popover';
	import {
		getMarkdownFieldContentComponentReferenceTarget,
		getMarkdownFieldSelectedContentComponentState
	} from '$lib/components/form/markdown-field-content-component-selection';
	import {
		getMarkdownFieldDialogViewModel,
		getMarkdownFieldRichShellViewModel
	} from '$lib/components/form/markdown-field-view-model';
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
	import { localContent } from '$lib/stores/local-content';
	import { getDraftAssetRepoKey } from '$lib/features/draft-assets/shared';
	import type { MarkdownEditorController } from '$lib/features/markdown-editor/create-editor';
	import type { DraftAssetStore } from '$lib/features/draft-assets/types';
	import type { Editor } from '@tiptap/core';
	import {
		FORM_CONTENT_CONTEXT,
		type FormContentContext
	} from '$lib/components/form/form-content-context';
	import type { RootConfig } from '$lib/config/root-config';

	interface Props {
		fieldId?: string;
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		rows?: number;
		minLength?: number;
		maxLength?: number;
		components?: string[] | undefined;
		onchange?: () => void;
		onvalidationchange?: (errors: string[]) => void;
		storagePath?: string;
		assetsDir?: string;
		testAdapters?: MarkdownFieldTestAdapters;
	}

	interface MarkdownFieldTestAdapters {
		repoKey?: string | null;
		componentMode?: 'local' | 'github';
		rootConfig?: RootConfig | null;
		draftAssetStore?: DraftAssetStore;
		loadContentComponentRegistryForMode?: (
			mode: 'local' | 'github',
			options?: { scopeKey?: string; componentsDir?: string }
		) => Promise<ContentComponentRegistry>;
	}

	let {
		fieldId = undefined,
		label,
		value = $bindable(''),
		required = false,
		placeholder = 'Write in Markdown',
		rows = 12,
		minLength,
		maxLength,
		components = undefined,
		onchange,
		onvalidationchange,
		storagePath = 'static/images/',
		assetsDir,
		testAdapters = undefined
	}: Props = $props();

	let activeTab = $state<'rich' | 'markdown'>('rich');
	let richEditor = $state<MarkdownEditorController | null>(null);
	let editorHost = $state<HTMLDivElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let editorLoadError = $state<string | null>(null);
	let componentLoadError = $state<string | null>(null);
	let availableComponentRegistry = $state<ContentComponentRegistry | null>(null);
	let enabledComponentRegistry = $state<ContentComponentRegistry | null>(null);
	let uploadError = $state<string | null>(null);
	let editorUiVersion = $state(0);
	let componentDialogState = $state(createInitialMarkdownFieldComponentDialogState());
	let popoverState = $state(createInitialMarkdownFieldPopoverState());
	let contextualPopoverAnchor = $state<HTMLDivElement | null>(null);
	let destroyed = false;
	let lastValidationErrorsKey = $state('');

	const formContentContext = hasContext(FORM_CONTENT_CONTEXT)
		? getContext<FormContentContext>(FORM_CONTENT_CONTEXT)
		: null;
	const textareaId = fieldId ?? `markdown-field-${Math.random().toString(36).substring(2, 9)}`;

	const repoKey = $derived(
		testAdapters?.repoKey ??
			getDraftAssetRepoKey({
				selectedBackend: page.data.selectedBackend,
				selectedRepo: page.data.selectedRepo
			})
	);
	const characterCount = $derived(value.length);
	const activeRootConfig = $derived(
		getMarkdownFieldActiveRootConfig({
			testRootConfig: testAdapters?.rootConfig,
			selectedBackendKind: page.data.selectedBackend?.kind,
			localRootConfig: $localContent.rootConfig,
			pageRootConfig: page.data.rootConfig ?? null
		})
	);
	const contentComponentValidationMode = $derived(
		getMarkdownFieldValidationMode(activeRootConfig)
	);
	const isOverLimit = $derived(maxLength !== undefined && characterCount > maxLength);
	const isUnderMin = $derived(
		minLength !== undefined && characterCount > 0 && characterCount < minLength
	);
	const toolbarDisabled = $derived(!richEditor || editorLoadError !== null);
	let componentToolbarButtons = $state<ContentComponentToolbarButton[]>([]);

	function getReferenceState(): MarkdownFieldReferenceState | null {
		return collectMarkdownFieldReferenceState(formContentContext);
	}

	function getReferenceOptions(binding: string): Array<{ label: string; value: string }> {
		return getMarkdownFieldReferenceOptions(formContentContext, binding);
	}

	function getEditor(): Editor | null {
		void editorUiVersion;
		return richEditor?.editor ?? null;
	}

	function getSelectedContentComponentState() {
		return getMarkdownFieldSelectedContentComponentState({
			editor: getEditor(),
			componentToolbarButtons,
			formContentContext
		});
	}

	function queueDraftCleanup(previousMarkdown: string, nextMarkdown: string) {
		queueMarkdownFieldDraftCleanup({
			previousMarkdown,
			nextMarkdown,
			getCurrentMarkdown: () => value,
			isDestroyed: () => destroyed,
			draftAssets: testAdapters?.draftAssetStore
		});
	}

	function applyMarkdownChange(nextMarkdown: string) {
		if (nextMarkdown === value) {
			return;
		}

		const previousMarkdown = value;
		value = nextMarkdown;
		onchange?.();
		queueDraftCleanup(previousMarkdown, nextMarkdown);
	}

	async function stageImage(file: File): Promise<{ ref: string }> {
		return stageMarkdownFieldImage({
			file,
			repoKey,
			storagePath,
			draftAssets: testAdapters?.draftAssetStore
		});
	}

	function handleToolbarAction(callback: (editor: Editor) => void) {
		const editor = getEditor();
		if (!editor) {
			return;
		}

		uploadError = null;
		callback(editor);
	}

	function handleLinkAction() {
		const editor = getEditor();
		if (!editor) {
			return;
		}

		uploadError = null;
		const currentHref = normalizeMarkdownFieldHref(editor.getAttributes('link').href);
		const nextPopoverState = createMarkdownFieldLinkPopoverState({
			editor,
			href: currentHref,
			destroyed
		});
		if (!nextPopoverState) {
			return;
		}

		popoverState = startMarkdownFieldLinkEditing(nextPopoverState, destroyed);
	}

	async function handleImageFiles(files: File[]) {
		if (!richEditor || files.length === 0) {
			return;
		}

		uploadError = null;

		try {
			await richEditor.insertImageFiles(files);
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Failed to stage image';
		}
	}

	async function handleImageFilesSelected(files: File[], input: HTMLInputElement) {
		try {
			await handleImageFiles(files);
		} finally {
			input.value = '';
		}
	}

	function handleMarkdownInput(event: Event) {
		uploadError = null;
		const nextMarkdown = (event.currentTarget as HTMLTextAreaElement).value;
		applyMarkdownChange(nextMarkdown);
		richEditor?.setMarkdown(nextMarkdown);
	}

	function openImagePicker() {
		fileInput?.click();
	}

	function closeContextualPopover() {
		popoverState = closeMarkdownFieldPopover();
	}

	function dismissContextualPopover() {
		closeContextualPopover();
	}

	function openLinkPopoverFromEditorClick(href: string, rect: DOMRect) {
		if (destroyed) {
			return;
		}

		popoverState = startMarkdownFieldLinkEditing(
			openMarkdownFieldPopoverFromRect({
				kind: 'link',
				href,
				rect,
				startInEditMode: true
			}),
			destroyed
		);
	}

	function startLinkEditing() {
		popoverState = startMarkdownFieldLinkEditing(popoverState, destroyed);
	}

	function cancelLinkEditing() {
		dismissContextualPopover();
	}

	function submitLinkEditing() {
		const editor = getEditor();
		if (!editor) {
			return;
		}

		const normalizedLink = popoverState.linkValue.trim();
		handleToolbarAction((activeEditor) => {
			const chain = activeEditor.chain().focus().extendMarkRange('link');
			if (!normalizedLink) {
				chain.unsetLink().run();
				return;
			}

			chain.setLink({ href: normalizedLink }).run();
		});
		dismissContextualPopover();
	}

	function openCurrentPopoverHref() {
		if (!popoverState.popover?.href) {
			return;
		}

		window.open(popoverState.popover.href, '_blank', 'noopener');
	}

	function getComponentReferenceTarget(item?: ContentComponentToolbarButton | null) {
		return getMarkdownFieldContentComponentReferenceTarget({
			editor: getEditor(),
			item: item ?? getSelectedContentComponentState()?.item,
			formContentContext
		});
	}

	function getComponentJumpLabel(item?: ContentComponentToolbarButton | null): string | null {
		const referenceTarget = getComponentReferenceTarget(item);
		return referenceTarget ? `Jump to ${referenceTarget.fieldLabel}` : null;
	}

	function focusFieldPath(fieldPath: string): boolean {
		if (typeof document === 'undefined') {
			return false;
		}

		const escapedFieldPath =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(fieldPath)
				: fieldPath.replace(/["\\]/g, '\\$&');
		const fieldRoot = document.querySelector<HTMLElement>(
			`[data-field-path="${escapedFieldPath}"]`
		);
		if (!fieldRoot) {
			return false;
		}

		fieldRoot.scrollIntoView({ block: 'center', inline: 'nearest' });
		const panelOpener = fieldRoot.querySelector<HTMLElement>('[data-form-side-panel-opener="true"]');
		if (panelOpener) {
			panelOpener.click();
			return true;
		}

		const directFocusable = fieldRoot.querySelector<HTMLElement>(
			'.ProseMirror, input, textarea, select, [tabindex]:not([tabindex="-1"])'
		);
		if (directFocusable) {
			directFocusable.focus();
			if (
				directFocusable instanceof HTMLInputElement ||
				directFocusable instanceof HTMLTextAreaElement
			) {
				directFocusable.select();
			}
			return true;
		}

		return false;
	}

	function jumpToSelectedComponentReference(item?: ContentComponentToolbarButton | null): boolean {
		const referenceTarget = getComponentReferenceTarget(item);
		if (!referenceTarget) {
			return false;
		}

		dismissContextualPopover();
		closeComponentDialog({ restoreFocus: false });
		return focusFieldPath(referenceTarget.fieldPath);
	}

	function openSelectedComponentPopover(): boolean {
		const editor = getEditor();
		if (!editor || destroyed) {
			return false;
		}

		const nextPopover = getMarkdownFieldContextualPopoverState({
			editor,
			componentToolbarButtons
		});
		if (!nextPopover || nextPopover.kind !== 'component') {
			return false;
		}

		popoverState = {
			popover: nextPopover,
			open: true,
			linkMode: 'view',
			linkValue: nextPopover.href
		};
		return true;
	}

	function editCurrentPopoverTarget() {
		const popover = popoverState.popover;
		if (!popover) {
			return;
		}

		if (popover.kind === 'link') {
			void startLinkEditing();
			return;
		}

		if (popover.editItem) {
			void openComponentDialog(
				popover.editItem,
				contextualPopoverAnchor ?? editorHost ?? undefined
			);
		}
	}

	function removeCurrentLink() {
		if (popoverState.popover?.kind !== 'link') {
			return;
		}

		handleToolbarAction((editor) => {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
		});
		dismissContextualPopover();
	}

	function activateSelectedContentComponentFromKeyboard() {
		const selectedComponent = getSelectedContentComponentState();
		if (!selectedComponent) {
			return;
		}

		if (!selectedComponent.canEdit && selectedComponent.referenceTarget) {
			void jumpToSelectedComponentReference();
			return;
		}

		if (selectedComponent.referenceTarget && openSelectedComponentPopover()) {
			return;
		}

		void openComponentDialog(selectedComponent.item, editorHost ?? undefined);
	}

	function handleContentComponentClick() {
		const selectedComponent = getSelectedContentComponentState();
		if (!selectedComponent) {
			return;
		}

		if (!selectedComponent.canEdit && selectedComponent.referenceTarget) {
			void jumpToSelectedComponentReference(selectedComponent.item);
			return;
		}

		if (selectedComponent.referenceTarget) {
			void openSelectedComponentPopover();
			return;
		}

		void openComponentDialog(selectedComponent.item, editorHost ?? undefined);
	}

	function handleEditorHostClick(event: MouseEvent) {
		if (
			event.target instanceof Element &&
			event.target.closest('[data-tentman-content-component-node]')
		) {
			return;
		}

		requestAnimationFrame(() => {
			const result = getMarkdownFieldEditorHostClickResult({
				event,
				hasOpenDialog: Boolean(componentDialogState.item),
				destroyed,
				editor: getEditor(),
				componentToolbarButtons
			});

			if (result.kind === 'ignore') {
				return;
			}

			const selectedComponent = getSelectedContentComponentState();
			const componentEditItem =
				result.state.popover?.kind === 'component' ? result.state.popover.editItem : null;
			const componentJumpLabel = getComponentJumpLabel(componentEditItem);

			if (
				componentEditItem &&
				componentEditItem.contentComponent?.hasEditableFields &&
				!componentJumpLabel &&
				result.state.popover?.kind === 'component' &&
				(result.state.popover.broken || !result.state.popover.href)
			) {
				void openComponentDialog(componentEditItem, editorHost ?? undefined);
				return;
			}

			if (
				componentEditItem &&
				!componentEditItem.contentComponent?.hasEditableFields &&
				componentJumpLabel
			) {
				void jumpToSelectedComponentReference(componentEditItem);
				return;
			}

			if (selectedComponent && !selectedComponent.canEdit && selectedComponent.referenceTarget) {
				void jumpToSelectedComponentReference(selectedComponent.item);
				return;
			}

			popoverState = result.state;
			getEditor()?.view.dom.focus();
		});
	}

	function handleContextualPopoverOpenChange(nextOpen: boolean) {
		const nextPopoverState = closeMarkdownFieldPopoverIfNeeded(nextOpen);
		if (nextPopoverState) {
			popoverState = nextPopoverState;
		}
	}

	function isToolbarItemActive(item: { isActive?: (editor: Editor) => boolean }): boolean {
		return isMarkdownFieldToolbarItemActive(getEditor(), item);
	}

	function activateToolbarItem(
		item: ActionToolbarButton | InlineToggleButton | ContentComponentToolbarButton,
		trigger?: HTMLElement
	) {
		activateMarkdownFieldToolbarItem({
			item,
			trigger,
			onselect: (nextTrigger) => item.select?.(nextTrigger),
			onopendialog: (nextItem, nextTrigger) => void openComponentDialog(nextItem, nextTrigger),
			onrun: handleToolbarAction
		});
	}

	function openComponentDialog(item: ContentComponentToolbarButton, trigger?: HTMLElement) {
		const editor = getEditor();
		if (destroyed || !editor || !item.dialog) {
			return;
		}

		if (item.dialog.fields.length === 0) {
			handleToolbarAction((activeEditor) => {
				item.dialog?.submit(activeEditor, item.dialog?.getInitialValues?.(editor) ?? {});
			});
			return;
		}

		dismissContextualPopover();
		componentDialogState = openMarkdownFieldComponentDialog({
			item,
			editor,
			trigger,
			activeElement: document.activeElement
		});
	}

	function closeComponentDialog({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
		const { state, returnFocus } = closeMarkdownFieldComponentDialog(componentDialogState);
		componentDialogState = state;

		if (restoreFocus && !destroyed && returnFocus?.isConnected) {
			queueMicrotask(() => returnFocus.focus());
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !componentDialogState.item) {
			return;
		}

		event.preventDefault();
		closeComponentDialog();
	}

	function setComponentDialogValue(fieldId: string, nextValue: string) {
		componentDialogState = setMarkdownFieldComponentDialogValue({
			state: componentDialogState,
			fieldId,
			nextValue
		});
	}

	function submitComponentDialog() {
		const editor = getEditor();
		const item = componentDialogState.item;

		if (!editor || !item?.dialog) {
			return;
		}

		const validationError = getMarkdownFieldComponentDialogValidationError({
			item,
			values: componentDialogState.values
		});
		if (validationError) {
			componentDialogState = setMarkdownFieldComponentDialogError(
				componentDialogState,
				validationError
			);
			return;
		}

		handleToolbarAction((activeEditor) => {
			item.dialog?.submit(activeEditor, componentDialogState.values);
		});
		closeComponentDialog();
	}

	const { structureOptions, listOptions, inlineToggleButtons, actionButtons } =
		createMarkdownFieldToolbarConfig({
			onselectlink: handleLinkAction,
			onselectimage: openImagePicker
		});

	function getActiveStructureValue(): StructureValue {
		return getMarkdownFieldActiveStructureValue(getEditor());
	}

	function applyStructureValue(nextValue: StructureValue) {
		applyMarkdownFieldStructureValue({
			editor: getEditor(),
			nextValue,
			structureOptions,
			onrun: handleToolbarAction
		});
	}

	function getActiveListValue(): ListValue {
		return getMarkdownFieldActiveListValue(getEditor());
	}

	function applyListValue(nextValue: ListValue) {
		applyMarkdownFieldListValue({
			editor: getEditor(),
			nextValue,
			listOptions,
			onrun: handleToolbarAction
		});
	}

	function getActiveInlineFormatValues(): InlineFormatValue[] {
		return getMarkdownFieldActiveInlineFormatValues(getEditor(), inlineToggleButtons);
	}

	function handleInlineFormatChange(nextValues: string[]) {
		applyMarkdownFieldInlineFormatChange({
			editor: getEditor(),
			nextValues,
			inlineToggleButtons,
			onrun: handleToolbarAction
		});
	}

	const activeStructureValue = $derived(getActiveStructureValue());
	const activeStructureOption = $derived(
		structureOptions.find((item) => item.value === activeStructureValue) ?? structureOptions[0]
	);
	const activeListValue = $derived(getActiveListValue());
	const activeInlineValues = $derived(getActiveInlineFormatValues());
	const activeListIcon = $derived(activeListValue === 'orderedList' ? 'orderedList' : 'bulletList');
	const dialogViewModel = $derived(getMarkdownFieldDialogViewModel(componentDialogState));
	const richShellViewModel = $derived(getMarkdownFieldRichShellViewModel(popoverState));

	onMount(() => {
		let mounted = true;
		destroyed = false;

		async function setupEditor() {
			if (!editorHost) {
				return;
			}

			const nextEditorHost = editorHost;
			if (!nextEditorHost) {
				return;
			}

			const componentEnvironment = resolveMarkdownFieldComponentEnvironment({
				testRootConfig: testAdapters?.rootConfig,
				testComponentMode: testAdapters?.componentMode,
				testLoadRegistry: testAdapters?.loadContentComponentRegistryForMode,
				defaultLoadRegistry: loadContentComponentRegistryForMode,
				selectedBackendKind: page.data.selectedBackend?.kind,
				localRootConfig: get(localContent).rootConfig,
				pageRootConfig: page.data.rootConfig ?? null,
				repoKey
			});
			const editorState = await setupMarkdownFieldRichEditor({
				editorHost: nextEditorHost,
				markdown: value,
				placeholder,
				loadRegistry: componentEnvironment.loadRegistry,
				componentMode: componentEnvironment.componentMode,
				scopeKey: componentEnvironment.scopeKey,
				componentsDir: componentEnvironment.componentsDir,
				enabledComponentNames: components,
				assetsDir,
				storagePath,
				getContentItem: () => getMarkdownFieldContentItem(formContentContext),
				getReferenceState,
				resolveReferenceOptions: getReferenceOptions,
				stageImage,
				onContentComponentClick: handleContentComponentClick,
				onLinkClick: ({ href, rect }) => openLinkPopoverFromEditorClick(href, rect),
				onContentComponentActivate: activateSelectedContentComponentFromKeyboard,
				onMarkdownChange: applyMarkdownChange,
			onUiChange() {
				editorUiVersion += 1;
				},
				onError(message) {
					uploadError = message;
				}
			});

			if (!mounted || editorHost !== nextEditorHost) {
				destroyMarkdownFieldRichEditor(editorState.richEditor);
				return;
			}

			availableComponentRegistry = editorState.availableRegistry;
			enabledComponentRegistry = editorState.enabledRegistry;
			componentToolbarButtons = editorState.componentToolbarButtons;
			richEditor = editorState.richEditor;
			editorLoadError = null;
		}

		void setupEditor().catch((error) => {
			if (!mounted) {
				return;
			}

			editorLoadError =
				error instanceof Error ? error.message : 'Failed to load the rich markdown editor';
		});

		return () => {
			mounted = false;
			destroyed = true;
			closeContextualPopover();
			closeComponentDialog({ restoreFocus: false });
			destroyMarkdownFieldRichEditor(richEditor);
			richEditor = null;
		};
	});

	$effect(() => {
		if (!richEditor) {
			return;
		}

		syncMarkdownFieldRichEditorMarkdown(richEditor, value);
	});

	$effect(() => {
		const validationState = getNextMarkdownFieldValidationState({
			formContentContext,
			markdown: value,
			enabledComponentNames: components,
			availableRegistry: availableComponentRegistry,
			enabledRegistry: enabledComponentRegistry,
			lastValidationErrorsKey,
			validationMode: contentComponentValidationMode
		});

		componentLoadError = validationState.componentLoadError;
		lastValidationErrorsKey = validationState.lastValidationErrorsKey;
		if (validationState.validationErrorsToEmit) {
			onvalidationchange?.(validationState.validationErrorsToEmit);
		}
	});

	$effect(() => {
		if (!componentDialogState.item) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});

	$effect(() => {
		if (activeTab !== 'rich' || componentDialogState.item) {
			closeContextualPopover();
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="mb-4">
	<MarkdownFieldHeader
		{textareaId}
		{label}
		{required}
		{maxLength}
		{characterCount}
		{isOverLimit}
		{activeTab}
		ontabchange={(tab) => (activeTab = tab)}
	/>

	<MarkdownFieldAlerts {uploadError} {componentLoadError} />

	{#if activeTab === 'rich'}
		<MarkdownFieldRichEditorShell
			bind:editorHost
			bind:fileInput
			bind:contextualPopoverAnchor
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
			editorLoadError={editorLoadError}
			hasRichEditor={Boolean(richEditor)}
			isInvalid={isOverLimit || isUnderMin}
			contextualPopover={richShellViewModel.contextualPopover}
			contextualPopoverOpen={popoverState.open}
			contextualPopoverAnchorStyle={richShellViewModel.contextualPopoverAnchorStyle}
			linkMode={popoverState.linkMode}
			linkValue={popoverState.linkValue}
			componentJumpLabel={getComponentJumpLabel()}
			componentDialog={componentDialogState.item?.dialog ?? null}
			componentDialogTitle={dialogViewModel.title}
			componentDialogSubmitLabel={dialogViewModel.submitLabel}
			componentDialogValues={componentDialogState.values}
			componentDialogSerializedValue={dialogViewModel.serializedValue}
			componentDialogValidationError={dialogViewModel.validationError}
			istoolbaritemactive={isToolbarItemActive}
			onapplystructurevalue={applyStructureValue}
			onapplylistvalue={applyListValue}
			onhandleinlineformatchange={handleInlineFormatChange}
			onactivatetoolbaritem={activateToolbarItem}
			onimagefilesselected={handleImageFilesSelected}
			oneditorhostclick={handleEditorHostClick}
			oncontextualpopoveropenchange={handleContextualPopoverOpenChange}
			onlinkvaluechange={(value) => (popoverState = setMarkdownFieldLinkValue(popoverState, value))}
			onstartlinkedit={() => void startLinkEditing()}
			onsubmitlinkedit={submitLinkEditing}
			oncancellinkedit={cancelLinkEditing}
			onedittarget={editCurrentPopoverTarget}
			onjumptarget={jumpToSelectedComponentReference}
			onopencurrenthref={openCurrentPopoverHref}
			onremovecurrentlink={removeCurrentLink}
			onclosecomponentdialog={closeComponentDialog}
			onsubmitcomponentdialog={submitComponentDialog}
			oncomponentdialogvaluechange={setComponentDialogValue}
		/>
	{:else}
		<MarkdownFieldPlainTextarea
			{textareaId}
			{value}
			{placeholder}
			{required}
			{rows}
			isInvalid={isOverLimit || isUnderMin}
			oninputchange={handleMarkdownInput}
		/>
	{/if}
</div>
