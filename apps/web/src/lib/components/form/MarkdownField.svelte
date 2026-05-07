<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { DropdownMenu, Popover, Separator, Toolbar } from 'bits-ui';
	import { page } from '$app/state';
	import { loadContentComponentRegistryForMode } from '$lib/content-components/browser';
	import { createMarkdownContentComponentArtifacts } from '$lib/content-components/markdown';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import ToolbarIcon from '$lib/features/markdown-editor/ToolbarIcon.svelte';
	import { loadMarkdownPluginsForMode } from '$lib/plugins/browser';
	import type { MarkdownToolbarItemContribution } from '$lib/plugins/types';
	import { localContent } from '$lib/stores/local-content';
	import { createMarkdownEditor } from '$lib/features/markdown-editor/create-editor';
	import {
		collectDraftAssetRefsFromString,
		getDraftAssetRepoKey
	} from '$lib/features/draft-assets/shared';
	import { getDraftImageValidationError } from '$lib/features/draft-assets/validation';
	import type { MarkdownEditorController } from '$lib/features/markdown-editor/create-editor';
	import type { Editor } from '@tiptap/core';

	interface Props {
		fieldId?: string;
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		rows?: number;
		minLength?: number;
		maxLength?: number;
		plugins?: string[];
		onchange?: () => void;
		storagePath?: string;
		assetsDir?: string;
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
		plugins = [],
		onchange,
		storagePath = 'static/images/',
		assetsDir
	}: Props = $props();

	let activeTab = $state<'rich' | 'markdown'>('rich');
	let richEditor = $state<MarkdownEditorController | null>(null);
	let editorHost = $state<HTMLDivElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let editorLoadError = $state<string | null>(null);
	let pluginLoadError = $state<string | null>(null);
	let uploadError = $state<string | null>(null);
	let editorUiVersion = $state(0);
	let structureMenuOpen = $state(false);
	let listMenuOpen = $state(false);
	let structureMenuAnchor = $state<HTMLButtonElement | null>(null);
	let listMenuAnchor = $state<HTMLButtonElement | null>(null);
	let pluginDialogItem = $state<PluginToolbarButton | null>(null);
	let pluginDialogValues = $state<Record<string, string>>({});
	let pluginDialogError = $state<string | null>(null);
	let pluginDialogForm = $state<HTMLFormElement | null>(null);
	let pluginDialogReturnFocus = $state<HTMLElement | null>(null);
	let pluginDialogMode = $state<'insert' | 'edit'>('insert');
	let contextualPopover = $state<ContextualPopoverState | null>(null);
	let contextualPopoverOpen = $state(false);
	let linkPopoverMode = $state<'view' | 'edit'>('view');
	let linkPopoverValue = $state('');
	let linkPopoverInput = $state<HTMLInputElement | null>(null);
	let contextualPopoverAnchor = $state<HTMLDivElement | null>(null);
	let destroyed = false;

	const textareaId = `markdown-field-${Math.random().toString(36).substring(2, 9)}`;
	type ToolbarIconName =
		| 'paragraph'
		| 'heading1'
		| 'heading2'
		| 'heading3'
		| 'bold'
		| 'italic'
		| 'strike'
		| 'code'
		| 'bulletList'
		| 'orderedList'
		| 'blockquote'
		| 'codeBlock'
		| 'divider'
		| 'link'
		| 'image'
		| 'chevronDown'
		| 'check';
	type StructureValue = 'paragraph' | 'heading1' | 'heading2' | 'heading3';
	type ListValue = 'none' | 'bulletList' | 'orderedList';
	type InlineFormatValue = 'bold' | 'italic' | 'strike' | 'code';

	interface StructureOption {
		value: StructureValue;
		label: string;
		icon: ToolbarIconName;
		run: (editor: Editor) => void;
	}

	interface ListOption {
		value: ListValue;
		label: string;
		icon: ToolbarIconName;
		run: (editor: Editor) => void;
	}

	interface InlineToggleButton {
		value: InlineFormatValue;
		label: string;
		icon: ToolbarIconName;
		isActive: (editor: Editor) => boolean;
		run: (editor: Editor) => void;
	}

	interface ActionToolbarButton {
		id: string;
		label: string;
		icon: ToolbarIconName;
		toggle?: boolean;
		isActive?: (editor: Editor) => boolean;
		run?: (editor: Editor) => void;
		select?: (trigger?: HTMLElement) => void;
	}

	interface PluginToolbarButton extends MarkdownToolbarItemContribution {
		buttonLabel: string;
	}

	interface ContextualPopoverState {
		kind: 'link' | 'plugin';
		href: string;
		top: number;
		left: number;
		placement: 'above' | 'below';
		editItem: PluginToolbarButton | null;
	}

	const repoKey = $derived(
		getDraftAssetRepoKey({
			selectedBackend: page.data.selectedBackend,
			selectedRepo: page.data.selectedRepo
		})
	);
	const characterCount = $derived(value.length);
	const isOverLimit = $derived(maxLength !== undefined && characterCount > maxLength);
	const isUnderMin = $derived(
		minLength !== undefined && characterCount > 0 && characterCount < minLength
	);
	const toolbarDisabled = $derived(!richEditor || editorLoadError !== null);
	let pluginToolbarButtons = $state<PluginToolbarButton[]>([]);

	function getEditor(): Editor | null {
		void editorUiVersion;
		return richEditor?.editor ?? null;
	}

	function toolbarButtonClass(active = false): string {
		return active
			? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-stone-100 text-stone-900 transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:w-10'
			: 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:w-10';
	}

	function toolbarTriggerClass(active = false): string {
		return active
			? 'inline-flex h-9 w-12 shrink-0 items-center justify-between rounded-md border border-stone-300 bg-stone-100 px-2.5 text-sm font-medium text-stone-900 transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:w-14 sm:px-3'
			: 'inline-flex h-9 w-12 shrink-0 items-center justify-between rounded-md border border-stone-200 bg-white px-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:w-14 sm:px-3';
	}

	function toggleGroupButtonClass(
		active = false,
		position: 'start' | 'middle' | 'end' | 'only' = 'only'
	): string {
		const radiusClass =
			position === 'only'
				? 'rounded-md'
				: position === 'start'
					? 'rounded-l-md rounded-r-none'
					: position === 'end'
						? 'rounded-r-md rounded-l-none'
						: 'rounded-none';

		return active
			? `relative z-10 flex h-9 w-9 shrink-0 items-center justify-center border border-stone-300 bg-stone-100 text-stone-900 ${radiusClass} focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:w-10`
			: `relative flex h-9 w-9 shrink-0 items-center justify-center border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900 ${radiusClass} focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:w-10`;
	}

	function dropdownContentClass(): string {
		return 'z-50 min-w-48 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg';
	}

	function dropdownRadioItemClass(checked = false): string {
		return checked
			? 'flex cursor-default items-center justify-between rounded-md bg-stone-100 px-2.5 py-2 text-sm font-medium text-stone-900 outline-none'
			: 'flex cursor-default items-center justify-between rounded-md px-2.5 py-2 text-sm text-stone-700 outline-none hover:bg-stone-100 focus:bg-stone-100';
	}

	function queueDraftCleanup(previousMarkdown: string, nextMarkdown: string) {
		const previousRefs = new Set(collectDraftAssetRefsFromString(previousMarkdown));
		const nextRefs = new Set(collectDraftAssetRefsFromString(nextMarkdown));
		const removedRefs = Array.from(previousRefs).filter((ref) => !nextRefs.has(ref));

		if (removedRefs.length === 0) {
			return;
		}

		queueMicrotask(() => {
			if (destroyed) {
				return;
			}

			const activeRefs = new Set(collectDraftAssetRefsFromString(value));
			const refsToDelete = removedRefs.filter((ref) => !activeRefs.has(ref));

			if (refsToDelete.length === 0) {
				return;
			}

			void Promise.all(refsToDelete.map((ref) => draftAssetStore.delete(ref)));
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

	function normalizeHref(value: unknown): string {
		return typeof value === 'string' ? value.trim() : '';
	}

	async function stageImage(file: File): Promise<{ ref: string }> {
		const validationError = getDraftImageValidationError(file);
		if (validationError) {
			throw new Error(validationError);
		}

		if (!repoKey) {
			throw new Error('Unable to determine the current repository for draft asset storage.');
		}

		const result = await draftAssetStore.create(file, {
			repoKey,
			storagePath
		});

		return {
			ref: result.ref
		};
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
		const currentHref = normalizeHref(editor.getAttributes('link').href);
		contextualPopover = createLinkPopoverState(editor, currentHref);
		if (!contextualPopover) {
			return;
		}

		contextualPopoverOpen = true;
		linkPopoverValue = currentHref;
		void startLinkEditing();
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

	function getActiveRootConfig() {
		return page.data.selectedBackend?.kind === 'local'
			? get(localContent).rootConfig
			: (page.data.rootConfig ?? null);
	}

	function getPluginMode(): 'local' | 'github' {
		return page.data.selectedBackend?.kind === 'local' ? 'local' : 'github';
	}

	function getActiveComponentsDir(): string | undefined {
		return getActiveRootConfig()?.componentsDir;
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

	function getPluginDialogTitle(item: PluginToolbarButton | null): string {
		if (!item?.dialog) {
			return '';
		}

		return pluginDialogMode === 'edit' ? `Edit ${item.dialog.title}` : `Insert ${item.dialog.title}`;
	}

	function getPluginDialogSubmitLabel(item: PluginToolbarButton | null): string {
		if (!item?.dialog) {
			return 'Insert';
		}

		if (item.dialog.submitLabel) {
			return item.dialog.submitLabel;
		}

		return pluginDialogMode === 'edit' ? 'Save changes' : 'Insert';
	}

	function getPluginDialogSerializedValue(): string | null {
		if (!pluginDialogItem?.dialog?.serialize) {
			return null;
		}

		try {
			return pluginDialogItem.dialog.serialize(pluginDialogValues) ?? null;
		} catch {
			return null;
		}
	}

	function getSelectionRect(editor: Editor): DOMRect | null {
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

	function getPopoverPosition(
		rect: DOMRect
	): Pick<ContextualPopoverState, 'top' | 'left' | 'placement'> {
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

	function createPopoverStateFromRect(
		kind: ContextualPopoverState['kind'],
		href: string,
		rect: DOMRect,
		editItem: PluginToolbarButton | null = null
	): ContextualPopoverState {
		return {
			kind,
			href,
			editItem,
			...getPopoverPosition(rect)
		};
	}

	function createLinkPopoverState(editor: Editor, href: string): ContextualPopoverState | null {
		const rect = getSelectionRect(editor);
		if (!rect) {
			return null;
		}

		return createPopoverStateFromRect('link', href, rect);
	}

	function getActivePluginToolbarButton(editor: Editor): PluginToolbarButton | null {
		return pluginToolbarButtons.find((item) => item.dialog && item.isActive?.(editor)) ?? null;
	}

	function dedupeToolbarButtons(
		items: PluginToolbarButton[],
		preferred: 'first' | 'last' = 'last'
	): PluginToolbarButton[] {
		const byId = new Map<string, PluginToolbarButton>();
		const orderedItems = preferred === 'last' ? items : [...items].reverse();

		for (const item of orderedItems) {
			if (!byId.has(item.id)) {
				byId.set(item.id, item);
			}
		}

		return preferred === 'last' ? Array.from(byId.values()) : Array.from(byId.values()).reverse();
	}

	function getContextualPopoverState(editor: Editor): ContextualPopoverState | null {
		const selection = editor.state.selection as {
			from: number;
			node?: {
				attrs?: Record<string, unknown>;
			};
		};
		const nodeHref = normalizeHref(selection.node?.attrs?.href);

		if (selection.node && nodeHref) {
			const nodeDom = editor.view.nodeDOM(selection.from);
			const rect = nodeDom instanceof Element ? nodeDom.getBoundingClientRect() : null;
			if (!rect) {
				return null;
			}

			const editItem = getActivePluginToolbarButton(editor);
			return createPopoverStateFromRect('plugin', nodeHref, rect, editItem);
		}

		if (!editor.isActive('link')) {
			return null;
		}

		const href = normalizeHref(editor.getAttributes('link').href);
		return href ? createLinkPopoverState(editor, href) : null;
	}

	function closeContextualPopover() {
		contextualPopoverOpen = false;
		contextualPopover = null;
		linkPopoverMode = 'view';
		linkPopoverValue = '';
	}

	function dismissContextualPopover() {
		closeContextualPopover();
	}

	function openLinkPopoverFromEditorClick(href: string, rect: DOMRect) {
		if (destroyed) {
			return;
		}

		contextualPopover = createPopoverStateFromRect('link', href, rect);
		contextualPopoverOpen = true;
		linkPopoverValue = href;
		void startLinkEditing();
	}

	async function startLinkEditing() {
		if (destroyed || !contextualPopover || contextualPopover.kind !== 'link') {
			return;
		}

		linkPopoverMode = 'edit';
		linkPopoverValue = contextualPopover.href;
		await tick();
		if (destroyed || linkPopoverMode !== 'edit') {
			return;
		}

		linkPopoverInput?.focus();
		linkPopoverInput?.select();
	}

	function cancelLinkEditing() {
		dismissContextualPopover();
	}

	function submitLinkEditing() {
		const editor = getEditor();
		if (!editor) {
			return;
		}

		const normalizedLink = linkPopoverValue.trim();
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
		if (!contextualPopover?.href) {
			return;
		}

		window.open(contextualPopover.href, '_blank', 'noopener');
	}

	function editCurrentPopoverTarget() {
		if (!contextualPopover) {
			return;
		}

		if (contextualPopover.kind === 'link') {
			void startLinkEditing();
			return;
		}

		if (contextualPopover.editItem) {
			void openPluginDialog(
				contextualPopover.editItem,
				contextualPopoverAnchor ?? editorHost ?? undefined
			);
		}
	}

	function removeCurrentLink() {
		if (contextualPopover?.kind !== 'link') {
			return;
		}

		handleToolbarAction((editor) => {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
		});
		dismissContextualPopover();
	}

	function contextualPopoverAnchorStyle(popover: ContextualPopoverState): string {
		return `left:${popover.left}px;top:${
			popover.placement === 'above' ? popover.top : popover.top - 1
		}px;`;
	}

	function handleEditorHostClick(event: MouseEvent) {
		if (event.metaKey || event.ctrlKey || pluginDialogItem) {
			return;
		}

		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('a[href]') &&
			!target.closest('[data-tentman-content-component-node]')
		) {
			return;
		}

		queueMicrotask(() => {
			if (destroyed) {
				return;
			}

			const editor = getEditor();
			if (!editor) {
				return;
			}

			const nextPopover = getContextualPopoverState(editor);
			if (!nextPopover) {
				return;
			}

			contextualPopover = nextPopover;
			contextualPopoverOpen = true;
			linkPopoverValue = nextPopover.href;

			if (nextPopover.kind === 'link') {
				void startLinkEditing();
				return;
			}

			linkPopoverMode = 'view';
		});
	}

	function handleContextualPopoverOpenChange(nextOpen: boolean) {
		if (nextOpen) {
			return;
		}

		dismissContextualPopover();
	}

	function isToolbarItemActive(item: { isActive?: (editor: Editor) => boolean }): boolean {
		const editor = getEditor();
		if (!editor || !item.isActive) {
			return false;
		}

		return item.isActive(editor);
	}

	function activateToolbarItem(
		item: ActionToolbarButton | InlineToggleButton | PluginToolbarButton,
		trigger?: HTMLElement
	) {
		if ('select' in item && item.select) {
			item.select(trigger);
			return;
		}

		if ('dialog' in item && item.dialog) {
			void openPluginDialog(item, trigger);
			return;
		}

		if (!item.run) {
			return;
		}

		handleToolbarAction(item.run);
	}

	async function openPluginDialog(item: PluginToolbarButton, trigger?: HTMLElement) {
		const editor = getEditor();
		if (destroyed || !editor || !item.dialog) {
			return;
		}

		dismissContextualPopover();
		pluginDialogReturnFocus = trigger ?? (document.activeElement as HTMLElement | null);
		pluginDialogMode = item.isActive?.(editor) ? 'edit' : 'insert';
		pluginDialogItem = item;
		pluginDialogError = null;
		pluginDialogValues = {
			...Object.fromEntries(
				item.dialog.fields.map((field) => [field.id, field.defaultValue ?? ''])
			),
			...(item.dialog.getInitialValues?.(editor) ?? {})
		};

		await tick();
		if (destroyed || pluginDialogItem !== item) {
			return;
		}

		pluginDialogForm
			?.querySelector<
				HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
			>('input, select, textarea')
			?.focus();
	}

	function closePluginDialog({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
		pluginDialogItem = null;
		pluginDialogValues = {};
		pluginDialogError = null;
		pluginDialogMode = 'insert';
		const returnFocus = pluginDialogReturnFocus;
		pluginDialogReturnFocus = null;

		if (restoreFocus && !destroyed && returnFocus?.isConnected) {
			queueMicrotask(() => returnFocus.focus());
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !pluginDialogItem) {
			return;
		}

		event.preventDefault();
		closePluginDialog();
	}

	function setPluginDialogValue(fieldId: string, nextValue: string) {
		pluginDialogValues = {
			...pluginDialogValues,
			[fieldId]: nextValue
		};
		pluginDialogError = null;
	}

	function getPluginDialogValidationError(item = pluginDialogItem): string | null {
		if (!item?.dialog) {
			return null;
		}

		const missingRequiredField = item.dialog.fields.find(
			(field) => field.required && !pluginDialogValues[field.id]?.trim()
		);
		if (missingRequiredField) {
			return `${missingRequiredField.label} is required.`;
		}

		return item.dialog.validate?.(pluginDialogValues) ?? null;
	}

	function submitPluginDialog() {
		const editor = getEditor();
		const item = pluginDialogItem;

		if (!editor || !item?.dialog) {
			return;
		}

		const validationError = getPluginDialogValidationError(item);
		if (validationError) {
			pluginDialogError = validationError;
			return;
		}

		handleToolbarAction((activeEditor) => {
			item.dialog?.submit(activeEditor, pluginDialogValues);
		});
		closePluginDialog();
	}

	const structureOptions: StructureOption[] = [
		{
			value: 'paragraph',
			label: 'Paragraph',
			icon: 'paragraph',
			run: (editor) => editor.chain().focus().setParagraph().run()
		},
		{
			value: 'heading1',
			label: 'Heading 1',
			icon: 'heading1',
			run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
		},
		{
			value: 'heading2',
			label: 'Heading 2',
			icon: 'heading2',
			run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			value: 'heading3',
			label: 'Heading 3',
			icon: 'heading3',
			run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
		}
	];

	const listOptions: ListOption[] = [
		{
			value: 'none',
			label: 'No list',
			icon: 'paragraph',
			run: (editor) => editor.chain().focus().liftListItem('listItem').run()
		},
		{
			value: 'bulletList',
			label: 'Bulleted list',
			icon: 'bulletList',
			run: (editor) => editor.chain().focus().toggleBulletList().run()
		},
		{
			value: 'orderedList',
			label: 'Numbered list',
			icon: 'orderedList',
			run: (editor) => editor.chain().focus().toggleOrderedList().run()
		}
	];

	const inlineToggleButtons: InlineToggleButton[] = [
		{
			value: 'bold',
			label: 'Bold',
			icon: 'bold',
			isActive: (editor) => editor.isActive('bold'),
			run: (editor) => editor.chain().focus().toggleBold().run()
		},
		{
			value: 'italic',
			label: 'Italic',
			icon: 'italic',
			isActive: (editor) => editor.isActive('italic'),
			run: (editor) => editor.chain().focus().toggleItalic().run()
		},
		{
			value: 'strike',
			label: 'Strikethrough',
			icon: 'strike',
			isActive: (editor) => editor.isActive('strike'),
			run: (editor) => editor.chain().focus().toggleStrike().run()
		},
		{
			value: 'code',
			label: 'Inline code',
			icon: 'code',
			isActive: (editor) => editor.isActive('code'),
			run: (editor) => editor.chain().focus().toggleCode().run()
		}
	];

	const actionButtons: ActionToolbarButton[] = [
		{
			id: 'blockquote',
			label: 'Block quote',
			icon: 'blockquote',
			toggle: true,
			isActive: (editor) => editor.isActive('blockquote'),
			run: (editor) => editor.chain().focus().toggleBlockquote().run()
		},
		{
			id: 'code-block',
			label: 'Code block',
			icon: 'codeBlock',
			toggle: true,
			isActive: (editor) => editor.isActive('codeBlock'),
			run: (editor) => editor.chain().focus().toggleCodeBlock().run()
		},
		{
			id: 'divider',
			label: 'Divider',
			icon: 'divider',
			run: (editor) => editor.chain().focus().setHorizontalRule().run()
		},
		{
			id: 'link',
			label: 'Link',
			icon: 'link',
			toggle: true,
			isActive: (editor) => editor.isActive('link'),
			select: handleLinkAction
		},
		{
			id: 'image',
			label: 'Image',
			icon: 'image',
			select: openImagePicker
		}
	];

	function getActiveStructureValue(): StructureValue {
		const editor = getEditor();
		if (!editor) {
			return 'paragraph';
		}

		if (editor.isActive('heading', { level: 1 })) {
			return 'heading1';
		}

		if (editor.isActive('heading', { level: 2 })) {
			return 'heading2';
		}

		if (editor.isActive('heading', { level: 3 })) {
			return 'heading3';
		}

		return 'paragraph';
	}

	function applyStructureValue(nextValue: StructureValue) {
		const option = structureOptions.find((item) => item.value === nextValue);
		if (!option) {
			return;
		}

		handleToolbarAction(option.run);
		structureMenuOpen = false;
	}

	function getActiveListValue(): ListValue {
		const editor = getEditor();
		if (!editor) {
			return 'none';
		}

		if (editor.isActive('bulletList')) {
			return 'bulletList';
		}

		if (editor.isActive('orderedList')) {
			return 'orderedList';
		}

		return 'none';
	}

	function applyListValue(nextValue: ListValue) {
		const option = listOptions.find((item) => item.value === nextValue);
		if (!option) {
			return;
		}

		handleToolbarAction(option.run);
		listMenuOpen = false;
	}

	function getActiveInlineFormatValues(): InlineFormatValue[] {
		const editor = getEditor();
		if (!editor) {
			return [];
		}

		return inlineToggleButtons.filter((item) => item.isActive(editor)).map((item) => item.value);
	}

	function handleInlineFormatChange(nextValues: string[]) {
		const currentValues = new Set(getActiveInlineFormatValues());
		const nextValueSet = new Set(nextValues as InlineFormatValue[]);
		const changedValue =
			nextValues.find((value) => !currentValues.has(value as InlineFormatValue)) ??
			Array.from(currentValues).find((value) => !nextValueSet.has(value));

		if (!changedValue) {
			return;
		}

		const item = inlineToggleButtons.find((button) => button.value === changedValue);
		if (!item) {
			return;
		}

		handleToolbarAction(item.run);
	}

	const activeStructureValue = $derived(getActiveStructureValue());
	const activeStructureOption = $derived(
		structureOptions.find((item) => item.value === activeStructureValue) ?? structureOptions[0]
	);
	const activeListValue = $derived(getActiveListValue());
	const activeInlineValues = $derived(getActiveInlineFormatValues());
	const activeListIcon = $derived(activeListValue === 'orderedList' ? 'orderedList' : 'bulletList');

	onMount(() => {
		let mounted = true;
		destroyed = false;

		async function setupEditor() {
			if (!editorHost) {
				return;
			}

			const pluginMode = getPluginMode();
			const scopeKey = repoKey ?? pluginMode;
			const [pluginResult, contentComponentRegistry] = await Promise.all([
				loadMarkdownPluginsForMode(
					{
						id: fieldId ?? textareaId,
						type: 'markdown',
						plugins
					},
					getActiveRootConfig(),
					pluginMode,
					{
						scopeKey
					}
				),
				loadContentComponentRegistryForMode(pluginMode, {
					scopeKey,
					componentsDir: getActiveComponentsDir()
				})
			]);

			if (!mounted || !editorHost) {
				return;
			}

			const contentComponentArtifacts =
				createMarkdownContentComponentArtifacts(contentComponentRegistry);
			pluginToolbarButtons = dedupeToolbarButtons(
				[
					...pluginResult.toolbarItems.map((item) => ({
						...item,
						buttonLabel: item.buttonLabel ?? item.label
					})),
					...contentComponentArtifacts.toolbarItems.map((item) => ({
						...item,
						buttonLabel: item.buttonLabel ?? item.label
					}))
				],
				'last'
			);
			const loadErrors = [...pluginResult.errors, ...contentComponentRegistry.errors];
			pluginLoadError = loadErrors.length > 0 ? loadErrors.join(' ') : null;

			richEditor = createMarkdownEditor({
				markdown: value,
				placeholder,
				assetsDir,
				storagePath,
				extensions: [...pluginResult.extensions, ...contentComponentArtifacts.extensions],
				stageImage,
				onLinkClick({ href, rect }) {
					openLinkPopoverFromEditorClick(href, rect);
				},
				onMarkdownChange(nextMarkdown) {
					applyMarkdownChange(nextMarkdown);
				},
				onUiChange() {
					editorUiVersion += 1;
				},
				onError(message) {
					uploadError = message;
				}
			});
			richEditor.editor.mount(editorHost);
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
			closePluginDialog({ restoreFocus: false });
			richEditor?.destroy();
			richEditor = null;
		};
	});

	$effect(() => {
		if (!richEditor) {
			return;
		}

		richEditor.setMarkdown(value);
	});

	$effect(() => {
		if (!pluginDialogItem) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});

	$effect(() => {
		if (activeTab !== 'rich' || pluginDialogItem) {
			closeContextualPopover();
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="mb-4">
	<div class="mb-1 flex items-center justify-between">
		<label for={textareaId} class="text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</label>
		{#if maxLength !== undefined}
			<span class="text-xs" class:text-red-600={isOverLimit} class:text-gray-500={!isOverLimit}>
				{characterCount}/{maxLength}
			</span>
		{/if}
	</div>

	<div class="mb-2 flex border-b border-gray-300">
		<button
			type="button"
			onclick={() => (activeTab = 'rich')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'rich'
				? 'border-stone-950 text-stone-950'
				: 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Rich
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'markdown')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'markdown'
				? 'border-stone-950 text-stone-950'
				: 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Markdown
		</button>
	</div>

	{#if uploadError}
		<div class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{uploadError}
		</div>
	{/if}

	{#if pluginLoadError}
		<div class="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
			<p class="font-medium">Plugin issue</p>
			<p class="mt-1 text-amber-800">{pluginLoadError}</p>
		</div>
	{/if}

	<div
		class:hidden={activeTab !== 'rich'}
		class="overflow-hidden rounded border bg-white"
		class:border-red-300={isOverLimit || isUnderMin}
		class:border-gray-300={!isOverLimit && !isUnderMin}
	>
		<div
			class="overflow-x-auto border-b border-stone-200 bg-white/80 px-3 py-2.5 [scrollbar-width:none]"
		>
			<Toolbar.Root
				aria-label="Markdown formatting"
				class="inline-flex min-w-max items-center gap-1.5 overscroll-x-contain sm:max-w-full sm:min-w-0 sm:gap-2 lg:gap-2.5"
			>
				<DropdownMenu.Root
					open={structureMenuOpen}
					onOpenChange={(open) => (structureMenuOpen = open)}
				>
					<Toolbar.Button disabled={toolbarDisabled}>
						{#snippet child({ props })}
							<button
								{...props}
								bind:this={structureMenuAnchor}
								class={toolbarTriggerClass(activeStructureValue !== 'paragraph')}
								aria-label="Text structure"
								aria-haspopup="menu"
								aria-expanded={structureMenuOpen}
								title="Text structure"
								onclick={() => (structureMenuOpen = !structureMenuOpen)}
							>
								<ToolbarIcon name={activeStructureOption.icon} class="size-4" />
								<ToolbarIcon name="chevronDown" class="size-3.5" />
							</button>
						{/snippet}
					</Toolbar.Button>

					<DropdownMenu.Portal>
						<DropdownMenu.Content
							sideOffset={8}
							align="start"
							customAnchor={structureMenuAnchor}
							class={dropdownContentClass()}
						>
							<DropdownMenu.RadioGroup
								value={activeStructureValue}
								onValueChange={(value) => applyStructureValue(value as StructureValue)}
							>
								{#each structureOptions as option (option.value)}
									<DropdownMenu.RadioItem value={option.value}>
										{#snippet child({ props, checked })}
											<div {...props} class={dropdownRadioItemClass(checked)}>
												<div class="flex items-center gap-2">
													<ToolbarIcon name={option.icon} class="size-4" />
													<span>{option.label}</span>
												</div>
												{#if checked}
													<ToolbarIcon name="check" class="size-4" />
												{/if}
											</div>
										{/snippet}
									</DropdownMenu.RadioItem>
								{/each}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>

				<Separator.Root
					orientation="vertical"
					decorative
					class="mx-1 hidden h-6 w-px bg-stone-200 sm:block"
				/>

				<Toolbar.Group
					type="multiple"
					value={activeInlineValues}
					onValueChange={handleInlineFormatChange}
					class="isolate flex shrink-0 items-center"
				>
					{#each inlineToggleButtons as item, index (item.value)}
						<Toolbar.GroupItem value={item.value} disabled={toolbarDisabled}>
							{#snippet child({ props, pressed })}
								<button
									{...props}
									class={toggleGroupButtonClass(
										pressed,
										inlineToggleButtons.length === 1
											? 'only'
											: index === 0
												? 'start'
												: index === inlineToggleButtons.length - 1
													? 'end'
													: 'middle'
									)}
									aria-label={item.label}
									title={item.label}
								>
									<ToolbarIcon name={item.icon} class="size-4" />
								</button>
							{/snippet}
						</Toolbar.GroupItem>
					{/each}
				</Toolbar.Group>

				<Separator.Root
					orientation="vertical"
					decorative
					class="mx-1 hidden h-6 w-px bg-stone-200 sm:block"
				/>

				<DropdownMenu.Root open={listMenuOpen} onOpenChange={(open) => (listMenuOpen = open)}>
					<Toolbar.Button disabled={toolbarDisabled}>
						{#snippet child({ props })}
							<button
								{...props}
								bind:this={listMenuAnchor}
								class={toolbarTriggerClass(activeListValue !== 'none')}
								aria-label="List style"
								aria-haspopup="menu"
								aria-expanded={listMenuOpen}
								title="List style"
								onclick={() => (listMenuOpen = !listMenuOpen)}
							>
								<ToolbarIcon name={activeListIcon} class="size-4" />
								<ToolbarIcon name="chevronDown" class="size-3.5" />
							</button>
						{/snippet}
					</Toolbar.Button>

					<DropdownMenu.Portal>
						<DropdownMenu.Content
							sideOffset={8}
							align="start"
							customAnchor={listMenuAnchor}
							class={dropdownContentClass()}
						>
							<DropdownMenu.RadioGroup
								value={activeListValue}
								onValueChange={(value) => applyListValue(value as ListValue)}
							>
								{#each listOptions as option (option.value)}
									<DropdownMenu.RadioItem value={option.value}>
										{#snippet child({ props, checked })}
											<div {...props} class={dropdownRadioItemClass(checked)}>
												<div class="flex items-center gap-2">
													<ToolbarIcon name={option.icon} class="size-4" />
													<span>{option.label}</span>
												</div>
												{#if checked}
													<ToolbarIcon name="check" class="size-4" />
												{/if}
											</div>
										{/snippet}
									</DropdownMenu.RadioItem>
								{/each}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>

				<Separator.Root
					orientation="vertical"
					decorative
					class="mx-1 hidden h-6 w-px bg-stone-200 sm:block"
				/>

				<div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
					{#each actionButtons as item (item.id)}
						<Toolbar.Button disabled={toolbarDisabled}>
							{#snippet child({ props })}
								<button
									{...props}
									class={toolbarButtonClass(isToolbarItemActive(item))}
									aria-label={item.label}
									title={item.label}
									aria-pressed={item.toggle ? isToolbarItemActive(item) : undefined}
									onclick={(event) => activateToolbarItem(item, event.currentTarget)}
								>
									<ToolbarIcon name={item.icon} class="size-4" />
								</button>
							{/snippet}
						</Toolbar.Button>
					{/each}

					{#each pluginToolbarButtons as item (item.id)}
						<Toolbar.Button disabled={toolbarDisabled}>
							{#snippet child({ props })}
								<button
									{...props}
									class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:px-3 sm:text-sm"
									aria-label={item.label}
									title={item.label}
									aria-pressed={item.isActive ? isToolbarItemActive(item) : undefined}
									onclick={(event) => activateToolbarItem(item, event.currentTarget)}
								>
									{item.buttonLabel}
								</button>
							{/snippet}
						</Toolbar.Button>
					{/each}
				</div>
			</Toolbar.Root>
		</div>

		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			data-testid="markdown-image-input"
			class="hidden"
			onchange={(event) => {
				const input = event.currentTarget as HTMLInputElement;
				const files = Array.from(input.files ?? []);
				void handleImageFiles(files).finally(() => {
					input.value = '';
				});
			}}
		/>

		{#if editorLoadError}
			<div class="px-4 py-3 text-sm text-red-700">{editorLoadError}</div>
		{:else if !richEditor}
			<div class="px-4 py-3 text-sm text-gray-500">Loading rich editor...</div>
		{/if}

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={editorHost}
			class="min-h-0"
			data-testid="markdown-rich-editor"
			onclick={handleEditorHostClick}
		></div>
	</div>
	{#if activeTab === 'rich'}
		{#if contextualPopover && contextualPopoverOpen}
			<div
				bind:this={contextualPopoverAnchor}
				aria-hidden="true"
				class="pointer-events-none fixed h-px w-px"
				style={contextualPopoverAnchorStyle(contextualPopover)}
			></div>

			<Popover.Root open={contextualPopoverOpen} onOpenChange={handleContextualPopoverOpenChange}>
				<Popover.Portal>
					<Popover.Content
						customAnchor={contextualPopoverAnchor}
						side={contextualPopover?.placement === 'above' ? 'top' : 'bottom'}
						sideOffset={12}
						align="center"
						trapFocus={false}
						onCloseAutoFocus={(event) => event.preventDefault()}
						class="z-40 w-[min(24rem,calc(100vw-1rem))] rounded-lg border border-stone-200 bg-white p-3 shadow-xl focus:outline-none"
						aria-label={contextualPopover?.kind === 'link' ? 'Link actions' : 'Plugin link actions'}
					>
						{#if contextualPopover?.kind === 'link' && linkPopoverMode === 'edit'}
							<form
								class="space-y-3"
								onsubmit={(event) => {
									event.preventDefault();
									submitLinkEditing();
								}}
							>
								<label class="block text-sm font-medium text-stone-700">
									<span class="mb-1 block">URL</span>
									<input
										bind:this={linkPopoverInput}
										class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
										type="url"
										value={linkPopoverValue}
										placeholder="https://example.com"
										oninput={(event) => (linkPopoverValue = event.currentTarget.value)}
									/>
								</label>

								<div class="flex flex-wrap justify-end gap-2">
									<button
										type="button"
										class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
										onclick={cancelLinkEditing}
									>
										Cancel
									</button>
									<button
										type="submit"
										class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
									>
										Save link
									</button>
								</div>
							</form>
						{:else}
							<div class="flex flex-wrap gap-2">
								<p class="min-w-full break-all text-sm text-stone-900">{contextualPopover?.href}</p>
								<button
									type="button"
									class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
									onclick={editCurrentPopoverTarget}
								>
									{contextualPopover?.kind === 'link'
										? 'Edit link'
										: `Edit ${contextualPopover?.editItem?.buttonLabel?.toLowerCase() ?? 'item'}`}
								</button>
								<button
									type="button"
									class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
									onclick={openCurrentPopoverHref}
								>
									Open link
								</button>
								{#if contextualPopover?.kind === 'link'}
									<button
										type="button"
										class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
										onclick={removeCurrentLink}
									>
										Remove link
									</button>
								{/if}
							</div>
						{/if}
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		{/if}

		<p class="mt-1 text-xs text-gray-500">
			Rich editing is client-only. Images are staged locally until you explicitly save. Use Cmd +
			click to open a selected link.
		</p>

		{#if pluginDialogItem?.dialog}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4"
				role="presentation"
				onclick={(event) => {
					if (event.target === event.currentTarget) {
						closePluginDialog();
					}
				}}
			>
				<div
					class="w-full max-w-md rounded-lg border border-stone-200 bg-white p-5 shadow-xl"
					role="dialog"
					aria-modal="true"
					aria-labelledby="markdown-plugin-dialog-title"
				>
					<form
						bind:this={pluginDialogForm}
						onsubmit={(event) => {
							event.preventDefault();
							submitPluginDialog();
						}}
					>
						<div class="mb-4 flex items-start justify-between gap-4">
							<h2 id="markdown-plugin-dialog-title" class="text-base font-semibold text-stone-950">
								{getPluginDialogTitle(pluginDialogItem)}
							</h2>
							<button
								type="button"
								class="rounded-md px-2 py-1 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
								aria-label="Close"
								onclick={closePluginDialog}
							>
								Close
							</button>
						</div>

						<div class="space-y-4">
							{#each pluginDialogItem.dialog.fields as field (field.id)}
								<label class="block text-sm font-medium text-stone-700">
									<span class="mb-1 block">
										{field.label}
										{#if field.required}
											<span class="text-red-600">*</span>
										{/if}
									</span>

									{#if field.type === 'select'}
										<select
											class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
											value={pluginDialogValues[field.id] ?? ''}
											required={field.required}
											onchange={(event) =>
												setPluginDialogValue(field.id, event.currentTarget.value)}
										>
											{#each field.options ?? [] as option (option.value)}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									{:else}
										<input
											class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
											type={field.type === 'url' ? 'url' : 'text'}
											value={pluginDialogValues[field.id] ?? ''}
											required={field.required}
											oninput={(event) => setPluginDialogValue(field.id, event.currentTarget.value)}
										/>
									{/if}
								</label>
							{/each}
						</div>

						{#if getPluginDialogSerializedValue()}
							<div class="mt-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-3">
								<p class="text-xs font-medium tracking-wide text-stone-500 uppercase">
									Markdown marker
								</p>
								<code class="mt-2 block whitespace-pre-wrap break-all font-mono text-xs text-stone-900">
									{getPluginDialogSerializedValue()}
								</code>
							</div>
						{/if}

						{#if pluginDialogError ?? getPluginDialogValidationError()}
							<div
								class="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
								role="alert"
							>
								{pluginDialogError ?? getPluginDialogValidationError()}
							</div>
						{/if}

						<div class="mt-5 flex justify-end gap-2">
							<button
								type="button"
								class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
								onclick={closePluginDialog}
							>
								Cancel
							</button>
							<button
								type="submit"
								class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-300 disabled:text-stone-100 disabled:shadow-none"
								disabled={Boolean(getPluginDialogValidationError())}
							>
								{getPluginDialogSubmitLabel(pluginDialogItem)}
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
	{:else}
		<textarea
			id={textareaId}
			{value}
			{placeholder}
			{required}
			{rows}
			oninput={handleMarkdownInput}
			class="w-full rounded-md border px-3 py-2 font-mono text-sm focus:ring-1 focus:outline-none"
			class:border-red-300={isOverLimit || isUnderMin}
			class:focus:border-red-500={isOverLimit || isUnderMin}
			class:focus:ring-red-500={isOverLimit || isUnderMin}
			class:border-gray-300={!isOverLimit && !isUnderMin}
			class:focus:border-stone-900={!isOverLimit && !isUnderMin}
			class:focus:ring-stone-900={!isOverLimit && !isUnderMin}
		></textarea>
		<p class="mt-1 text-xs text-gray-500">
			Markdown is the stored source of truth. Use this tab for precise edits and alt text.
		</p>
	{/if}
</div>

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
