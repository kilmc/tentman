<script lang="ts">
	import { DropdownMenu, Separator, Toolbar } from 'bits-ui';
	import ToolbarIcon from '$lib/features/markdown-editor/ToolbarIcon.svelte';
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
	import type { Editor } from '@tiptap/core';

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
		istoolbaritemactive,
		onapplystructurevalue,
		onapplylistvalue,
		onhandleinlineformatchange,
		onactivatetoolbaritem
	}: Props = $props();

	let structureMenuOpen = $state(false);
	let listMenuOpen = $state(false);
	let structureMenuAnchor = $state<HTMLButtonElement | null>(null);
	let listMenuAnchor = $state<HTMLButtonElement | null>(null);

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
</script>

<div
	class="overflow-x-auto border-b border-stone-200 bg-white/80 px-3 py-2.5 [scrollbar-width:none]"
>
	<Toolbar.Root
		aria-label="Markdown formatting"
		class="inline-flex min-w-max items-center gap-1.5 overscroll-x-contain sm:max-w-full sm:min-w-0 sm:gap-2 lg:gap-2.5 sticky top-50"
	>
		<DropdownMenu.Root open={structureMenuOpen} onOpenChange={(open) => (structureMenuOpen = open)}>
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
						onValueChange={(value) => onapplystructurevalue(value as StructureValue)}
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
			onValueChange={onhandleinlineformatchange}
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
						onValueChange={(value) => onapplylistvalue(value as ListValue)}
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
							class={toolbarButtonClass(istoolbaritemactive(item))}
							aria-label={item.label}
							title={item.label}
							aria-pressed={item.toggle ? istoolbaritemactive(item) : undefined}
							onclick={(event) => onactivatetoolbaritem(item, event.currentTarget)}
						>
							<ToolbarIcon name={item.icon} class="size-4" />
						</button>
					{/snippet}
				</Toolbar.Button>
			{/each}

			{#each componentToolbarButtons as item (item.id)}
				<Toolbar.Button disabled={toolbarDisabled}>
					{#snippet child({ props })}
						<button
							{...props}
							class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 sm:h-10 sm:px-3 sm:text-sm"
							aria-label={item.label}
							title={item.label}
							aria-pressed={item.isActive ? istoolbaritemactive(item) : undefined}
							onclick={(event) => onactivatetoolbaritem(item, event.currentTarget)}
						>
							{item.buttonLabel}
						</button>
					{/snippet}
				</Toolbar.Button>
			{/each}
		</div>
	</Toolbar.Root>
</div>
