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
	import MarkdownRichToolbar from '$lib/components/form/MarkdownRichToolbar.svelte';
	import AssetPicker from '$lib/components/assets/AssetPicker.svelte';
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
		getMarkdownFieldActiveStructureValue
	} from '$lib/components/form/markdown-field-toolbar-state';
	import {
		activateMarkdownFieldToolbarItem,
		applyMarkdownFieldInlineFormatChange,
		applyMarkdownFieldListValue,
		applyMarkdownFieldStructureValue,
		isMarkdownFieldToolbarItemActive
	} from '$lib/components/form/markdown-field-toolbar-actions';
	import { normalizeMarkdownFieldHref } from '$lib/components/form/markdown-field-ui';
	import { getMarkdownFieldContextualPopoverState } from '$lib/components/form/markdown-field-controller';
	import {
		createMarkdownFieldLinkPopoverState,
		getMarkdownFieldEditorHostClickResult
	} from '$lib/components/form/markdown-field-popover';
	import {
		getMarkdownFieldContentComponentState,
		getMarkdownFieldSelectedContentComponentState
	} from '$lib/components/form/markdown-field-content-component-selection';
	import {
		getMarkdownFieldDialogViewModel,
		getMarkdownFieldRichShellViewModel
	} from '$lib/components/form/markdown-field-view-model';
	import type { MarkdownEditorContentComponentActivationRequest } from '$lib/features/markdown-editor/content-component-interactions';
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
	import { imageAssetFilter, type AssetPickerEntry } from '$lib/features/assets/asset-picker';
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
		fieldPath?: string;
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
		loadAssetEntries?: (options: {
			config: { assetPath?: string | null; publicPath?: string | null };
			filter: typeof imageAssetFilter;
			mode: 'github' | 'local';
		}) => Promise<AssetPickerEntry[]>;
		loadContentComponentRegistryForMode?: (
			mode: 'local' | 'github',
			options?: { scopeKey?: string; componentsDir?: string }
		) => Promise<ContentComponentRegistry>;
	}

	let {
		fieldId = undefined,
		fieldPath = undefined,
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
		storagePath = page.data.rootConfig?.assets?.path ?? '',
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
	let assetPickerOpen = $state(false);
	let editorUiVersion = $state(0);
	const uploadDisabledMessage =
		'Configure assets.path and assets.publicPath in tentman.json to enable uploads';
	let componentDialogState = $state(createInitialMarkdownFieldComponentDialogState());
	let popoverState = $state(createInitialMarkdownFieldPopoverState());
	let contextualPopoverAnchor = $state<HTMLDivElement | null>(null);
	let destroyed = false;
	let lastValidationErrorsKey = $state('');

	const formContentContext = hasContext(FORM_CONTENT_CONTEXT)
		? getContext<FormContentContext>(FORM_CONTENT_CONTEXT)
		: null;
	const generatedTextareaId = `markdown-field-${Math.random().toString(36).substring(2, 9)}`;
	const textareaId = $derived(fieldId ?? generatedTextareaId);

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
	const rootAssets = $derived(activeRootConfig?.assets ?? null);
	const contentComponentValidationMode = $derived(getMarkdownFieldValidationMode(activeRootConfig));
	const isOverLimit = $derived(maxLength !== undefined && characterCount > maxLength);
	const isUnderMin = $derived(
		minLength !== undefined && characterCount > 0 && characterCount < minLength
	);
	const toolbarDisabled = $derived(!richEditor || editorLoadError !== null);
	const assetPickerMode = $derived(
		page.data.selectedBackend?.kind === 'local' ? 'local' : 'github'
	);
	const assetPickerConfig = $derived({
		assetPath: rootAssets?.path,
		publicPath: rootAssets?.publicPath
	});
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

	function getBaselineMarkdown(): string {
		const baselineValue = fieldPath
			? formContentContext?.getBaselineFieldValue?.(fieldPath)
			: undefined;
		return typeof baselineValue === 'string' ? baselineValue : '';
	}

	function updateSemanticFingerprint(nextMarkdown: string, currentFingerprint?: string) {
		if (!fieldPath || !richEditor || !formContentContext?.updateSemanticFieldFingerprint) {
			return;
		}

		formContentContext.updateSemanticFieldFingerprint({
			kind: 'markdown',
			path: fieldPath,
			baselineFingerprint: richEditor.getMarkdownDocumentFingerprint(getBaselineMarkdown()),
			currentFingerprint:
				currentFingerprint ?? richEditor.getMarkdownDocumentFingerprint(nextMarkdown)
		});
	}

	function applyMarkdownChange(nextMarkdown: string, currentFingerprint?: string) {
		updateSemanticFingerprint(nextMarkdown, currentFingerprint);
		if (nextMarkdown === value) {
			return;
		}

		const previousMarkdown = value;
		value = nextMarkdown;
		onchange?.();
		queueDraftCleanup(previousMarkdown, nextMarkdown);
	}

	async function stageImage(file: File): Promise<{ ref: string }> {
		if (!storagePath || !rootAssets?.publicPath) {
			throw new Error(uploadDisabledMessage);
		}

		return stageMarkdownFieldImage({
			file,
			repoKey,
			storagePath,
			publicPath: rootAssets.publicPath,
			draftAssets: testAdapters?.draftAssetStore
		});
	}

	async function stagePickerImage(file: File): Promise<{ value: string }> {
		const staged = await stageImage(file);
		return { value: staged.ref };
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
		const nextFingerprint = richEditor?.getMarkdownDocumentFingerprint(nextMarkdown);
		applyMarkdownChange(nextMarkdown, nextFingerprint);
		richEditor?.setMarkdown(nextMarkdown);
	}

	function openImagePicker() {
		if (!richEditor) {
			console.warn('[tentman:asset-picker] markdown field open skipped: missing rich editor', {
				label,
				activeTab
			});
			return;
		}

		console.info('[tentman:asset-picker] markdown field opening picker', {
			label,
			activeTab,
			mode: assetPickerMode,
			assetPath: assetPickerConfig.assetPath ?? null,
			publicPath: assetPickerConfig.publicPath ?? null,
			hasRootAssets: Boolean(rootAssets),
			selectedBackendKind: page.data.selectedBackend?.kind ?? null,
			hasTestLoader: Boolean(testAdapters?.loadAssetEntries)
		});
		uploadError = null;
		assetPickerOpen = true;
	}

	function handleAssetPickerInsert(nextValue: string) {
		console.info('[tentman:asset-picker] markdown field inserting asset', {
			label,
			value: nextValue
		});
		richEditor?.insertImageValue(nextValue);
		assetPickerOpen = false;
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

	function getContentComponentStateForActivation(
		request?: MarkdownEditorContentComponentActivationRequest | null
	) {
		if (!request) {
			return getSelectedContentComponentState();
		}

		return getMarkdownFieldContentComponentState({
			node: {
				nodeTypeName: request.nodeTypeName,
				nodeAttributes: request.nodeAttributes
			},
			href: request.href,
			broken: request.broken,
			componentToolbarButtons,
			formContentContext
		});
	}

	function getComponentJumpLabel(
		contentComponent = getSelectedContentComponentState()
	): string | null {
		return contentComponent?.referenceTarget
			? `Jump to ${contentComponent.referenceTarget.fieldLabel}`
			: null;
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
		const panelOpener = fieldRoot.querySelector<HTMLElement>(
			'[data-form-side-panel-opener="true"]'
		);
		if (panelOpener) {
			panelOpener.click();
		}

		const directFocusable = fieldRoot.querySelector<HTMLElement>(
			'.ProseMirror, input, textarea, select, [tabindex]:not([tabindex="-1"])'
		);
		if (directFocusable) {
			const focusTarget = () => {
				directFocusable.focus();
				if (
					directFocusable instanceof HTMLInputElement ||
					directFocusable instanceof HTMLTextAreaElement
				) {
					directFocusable.select();
				}
			};

			focusTarget();
			queueMicrotask(focusTarget);
			requestAnimationFrame(focusTarget);
			setTimeout(focusTarget, 0);
			setTimeout(focusTarget, 50);
			return true;
		}

		return false;
	}

	function jumpToSelectedComponentReference(
		contentComponent = getSelectedContentComponentState()
	): boolean {
		const referenceTarget = contentComponent?.referenceTarget;
		if (!referenceTarget) {
			return false;
		}

		dismissContextualPopover();
		closeComponentDialog({ restoreFocus: false });
		return focusFieldPath(referenceTarget.fieldPath);
	}

	function openContentComponentHref(href: string): boolean {
		if (!href.trim()) {
			return false;
		}

		window.open(href, '_blank', 'noopener');
		return true;
	}

	function openContentComponentPopoverFromActivation(options: {
		contentComponent: NonNullable<ReturnType<typeof getContentComponentStateForActivation>>;
		request: MarkdownEditorContentComponentActivationRequest;
	}): boolean {
		if (!options.request.rect || destroyed) {
			return openSelectedComponentPopover(options.contentComponent);
		}

		popoverState = openMarkdownFieldPopoverFromRect({
			kind: 'component',
			href: options.request.href,
			rect: options.request.rect,
			editItem: options.contentComponent.item,
			referenceTarget: options.contentComponent.referenceTarget,
			broken: options.request.broken
		});
		return true;
	}

	function queueComponentReferenceJump(contentComponent = getSelectedContentComponentState()) {
		requestAnimationFrame(() => {
			void jumpToSelectedComponentReference(contentComponent);
		});
	}

	function openSelectedComponentPopover(
		contentComponent = getSelectedContentComponentState()
	): boolean {
		const editor = getEditor();
		if (!editor || destroyed || !contentComponent) {
			return false;
		}

		const nextPopover = getMarkdownFieldContextualPopoverState({
			editor,
			selectedContentComponentState: contentComponent
		});
		if (!nextPopover || nextPopover.kind !== 'component') {
			return false;
		}

		popoverState = {
			popover: nextPopover,
			open: true,
			linkMode: 'view',
			linkValue: nextPopover.href,
			componentEditItem: nextPopover.editItem,
			componentReferenceTarget: contentComponent.referenceTarget
		};
		return true;
	}

	function activateContentComponent(request?: MarkdownEditorContentComponentActivationRequest) {
		const contentComponent = getContentComponentStateForActivation(request);
		if (!contentComponent) {
			return;
		}

		switch (contentComponent.primaryAction) {
			case 'edit':
				void openComponentDialog(contentComponent.item, editorHost ?? undefined);
				return;
			case 'jump':
				queueComponentReferenceJump(contentComponent);
				return;
			case 'openHref':
				void openContentComponentHref(request?.href ?? contentComponent.href);
				return;
			case 'openActions':
				if (
					request
						? openContentComponentPopoverFromActivation({
								contentComponent,
								request
							})
						: openSelectedComponentPopover(contentComponent)
				) {
					return;
				}

				void openComponentDialog(contentComponent.item, editorHost ?? undefined);
				return;
			case 'none':
				return;
		}
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

		if (popoverState.componentEditItem) {
			void openComponentDialog(
				popoverState.componentEditItem,
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
				selectedContentComponentState: getSelectedContentComponentState()
			});

			if (result.kind === 'ignore') {
				return;
			}

			popoverState = result.state;
			getEditor()?.view.dom.focus();
		});
	}

	function handleContextualPopoverOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			popoverState = closeMarkdownFieldPopover();
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
			onselect: (nextTrigger) => ('select' in item ? item.select?.(nextTrigger) : undefined),
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
		if (event.key === 'Escape' && componentDialogState.item) {
			event.preventDefault();
			closeComponentDialog();
		}
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
				onLinkClick: ({ href, rect }) => openLinkPopoverFromEditorClick(href, rect),
				onContentComponentActivate: activateContentComponent,
				onMarkdownChange: (markdown) => {
					applyMarkdownChange(markdown, richEditor?.getDocumentFingerprint());
				},
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
			updateSemanticFingerprint(value, editorState.richEditor.getDocumentFingerprint());
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

		updateSemanticFingerprint(value);
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
	<div
		class="markdown-field-sticky-chrome z-20 grid min-w-0 gap-2 bg-white pt-2"
		data-testid="markdown-field-sticky-chrome"
	>
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
			<div
				class="min-w-0 rounded-t border border-b-0 bg-white"
				class:border-red-300={isOverLimit || isUnderMin}
				class:border-gray-300={!(isOverLimit || isUnderMin)}
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
					istoolbaritemactive={isToolbarItemActive}
					onapplystructurevalue={applyStructureValue}
					onapplylistvalue={applyListValue}
					onhandleinlineformatchange={handleInlineFormatChange}
					onactivatetoolbaritem={activateToolbarItem}
				/>
			</div>
		{/if}
	</div>

	<div class:hidden={activeTab !== 'rich'}>
		<MarkdownFieldRichEditorShell
			bind:editorHost
			bind:fileInput
			bind:contextualPopoverAnchor
			{editorLoadError}
			hasRichEditor={Boolean(richEditor)}
			isInvalid={isOverLimit || isUnderMin}
			contextualPopover={richShellViewModel.contextualPopover}
			contextualPopoverOpen={popoverState.open}
			contextualPopoverAnchorStyle={richShellViewModel.contextualPopoverAnchorStyle}
			linkMode={popoverState.linkMode}
			linkValue={popoverState.linkValue}
			componentJumpLabel={popoverState.componentReferenceTarget
				? `Jump to ${popoverState.componentReferenceTarget.fieldLabel}`
				: getComponentJumpLabel()}
			componentDialog={componentDialogState.item?.dialog ?? null}
			componentDialogTitle={dialogViewModel.title}
			componentDialogSubmitLabel={dialogViewModel.submitLabel}
			componentDialogValues={componentDialogState.values}
			componentDialogSerializedValue={dialogViewModel.serializedValue}
			componentDialogValidationError={dialogViewModel.validationError}
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

		<AssetPicker
			open={assetPickerOpen}
			filter={imageAssetFilter}
			config={assetPickerConfig}
			mode={assetPickerMode}
			currentValue={null}
			title="Insert image"
			oninsert={handleAssetPickerInsert}
			onupload={stagePickerImage}
			onclose={() => (assetPickerOpen = false)}
			loadentries={testAdapters?.loadAssetEntries}
		/>
	</div>

	<div class:hidden={activeTab !== 'markdown'}>
		<MarkdownFieldPlainTextarea
			{textareaId}
			{value}
			{placeholder}
			{required}
			{rows}
			isInvalid={isOverLimit || isUnderMin}
			oninputchange={handleMarkdownInput}
		/>
	</div>
</div>

<style>
	.markdown-field-sticky-chrome {
		position: sticky;
		top: var(--workspace-sticky-top, 0px);
	}
</style>
