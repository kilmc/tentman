<script lang="ts">
	import { onMount } from 'svelte';
	import { DropdownMenu, Separator, Toolbar } from 'bits-ui';
	import { page } from '$app/state';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import ToolbarIcon from '$lib/features/markdown-editor/ToolbarIcon.svelte';
	import {
		collectDraftAssetRefsFromString,
		getDraftAssetRepoKey
	} from '$lib/features/draft-assets/shared';
	import { getDraftImageValidationError } from '$lib/features/draft-assets/validation';
	import type { MarkdownEditorController } from '$lib/features/markdown-editor/create-editor';
	import type { Editor } from '@tiptap/core';

	interface Props {
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		rows?: number;
		minLength?: number;
		maxLength?: number;
		onchange?: () => void;
		storagePath?: string;
		assetsDir?: string;
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		placeholder = 'Write in Markdown',
		rows = 12,
		minLength,
		maxLength,
		onchange,
		storagePath = 'static/images/',
		assetsDir
	}: Props = $props();

	let activeTab = $state<'rich' | 'markdown'>('rich');
	let richEditor = $state<MarkdownEditorController | null>(null);
	let editorHost = $state<HTMLDivElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let editorLoadError = $state<string | null>(null);
	let uploadError = $state<string | null>(null);
	let editorUiVersion = $state(0);
	let structureMenuOpen = $state(false);
	let listMenuOpen = $state(false);
	let structureMenuAnchor = $state<HTMLButtonElement | null>(null);
	let listMenuAnchor = $state<HTMLButtonElement | null>(null);

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
		select?: () => void;
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

	function getEditor(): Editor | null {
		editorUiVersion;
		return richEditor?.editor ?? null;
	}

	function toolbarButtonClass(active = false): string {
		return active
			? 'flex h-10 w-10 items-center justify-center rounded-md border border-stone-400 bg-stone-100 text-stone-900 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300'
			: 'flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300';
	}

	function toolbarTriggerClass(active = false): string {
		return active
			? 'inline-flex h-10 w-14 items-center justify-between rounded-md border border-stone-400 bg-stone-100 px-3 text-sm font-medium text-stone-900 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300'
			: 'inline-flex h-10 w-14 items-center justify-between rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300';
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
			? `relative z-10 flex h-10 w-10 items-center justify-center border border-stone-400 bg-stone-100 text-stone-900 shadow-sm ${radiusClass} focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300`
			: `relative flex h-10 w-10 items-center justify-center border border-stone-200 bg-white text-stone-600 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900 ${radiusClass} focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300`;
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
		handleToolbarAction((editor) => {
			const currentHref =
				typeof editor.getAttributes('link').href === 'string'
					? editor.getAttributes('link').href
					: '';
			const nextHref = window.prompt('Enter a link URL', currentHref);

			if (nextHref === null) {
				return;
			}

			const normalizedHref = nextHref.trim();
			if (!normalizedHref) {
				editor.chain().focus().extendMarkRange('link').unsetLink().run();
				return;
			}

			editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run();
		});
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

	function handleMarkdownInput(event: Event) {
		uploadError = null;
		const nextMarkdown = (event.currentTarget as HTMLTextAreaElement).value;
		applyMarkdownChange(nextMarkdown);
		richEditor?.setMarkdown(nextMarkdown);
	}

	function openImagePicker() {
		fileInput?.click();
	}

	function isToolbarItemActive(item: { isActive?: (editor: Editor) => boolean }): boolean {
		const editor = getEditor();
		if (!editor || !item.isActive) {
			return false;
		}

		return item.isActive(editor);
	}

	function activateToolbarItem(item: ActionToolbarButton | InlineToggleButton) {
		if ('select' in item && item.select) {
			item.select();
			return;
		}

		if (!item.run) {
			return;
		}

		handleToolbarAction(item.run);
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
	const activeListLabel = $derived(
		activeListValue === 'none'
			? 'Lists'
			: (listOptions.find((item) => item.value === activeListValue)?.label ?? 'Lists')
	);
	const activeListIcon = $derived(activeListValue === 'orderedList' ? 'orderedList' : 'bulletList');

	onMount(() => {
		let mounted = true;

		async function setupEditor() {
			if (!editorHost) {
				return;
			}

			const { createMarkdownEditor } = await import('$lib/features/markdown-editor/create-editor');

			if (!mounted || !editorHost) {
				return;
			}

			richEditor = createMarkdownEditor({
				markdown: value,
				placeholder,
				assetsDir,
				storagePath,
				stageImage,
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
</script>

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

	{#if activeTab === 'rich'}
		<div
			class="overflow-hidden rounded border bg-white"
			class:border-red-300={isOverLimit || isUnderMin}
			class:border-gray-300={!isOverLimit && !isUnderMin}
		>
			<div class="border-b border-stone-200 bg-stone-50 p-3">
				<Toolbar.Root
					aria-label="Markdown formatting"
					class="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 bg-white p-2 shadow-sm"
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
						class="isolate flex items-center"
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

					<div class="flex flex-wrap gap-1">
						{#each actionButtons as item (item.id)}
							<Toolbar.Button disabled={toolbarDisabled}>
								{#snippet child({ props })}
									<button
										{...props}
										class={toolbarButtonClass(isToolbarItemActive(item))}
										aria-label={item.label}
										title={item.label}
										aria-pressed={item.toggle ? isToolbarItemActive(item) : undefined}
										onclick={() => activateToolbarItem(item)}
									>
										<ToolbarIcon name={item.icon} class="size-4" />
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

			<div bind:this={editorHost} data-testid="markdown-rich-editor"></div>
		</div>
		<p class="mt-1 text-xs text-gray-500">
			Rich editing is client-only. Images are staged locally until you explicitly save.
		</p>
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
</style>
