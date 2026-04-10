<script lang="ts">
	import { getContext, hasContext } from 'svelte';
	import { writable } from 'svelte/store';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import type { BlockUsage } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import {
		FORM_WORKSPACE_PANEL,
		type FormWorkspacePanelContext
	} from '$lib/features/forms/workspace-panel';
	import { getRepeatableItemLabel } from '$lib/features/forms/repeatable-labels';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import FormField from './FormField.svelte';

	interface Props {
		label: string;
		value: any[];
		fieldPath?: string;
		blocks?: BlockUsage[];
		itemLabel?: string;
		required?: boolean;
		onchange?: () => void;
		imagePath?: string;
		blockRegistry: BlockRegistry;
	}

	let {
		label,
		value = $bindable([]),
		fieldPath,
		blocks = [],
		itemLabel,
		required = false,
		onchange,
		imagePath,
		blockRegistry
	}: Props = $props();

	const fallbackPanelState = (() => {
		const activePanelId = writable<string | null>(null);
		return {
			activePanelId,
			setActivePanel(panelId: string | null) {
				activePanelId.set(panelId);
			}
		} satisfies FormWorkspacePanelContext;
	})();

	const workspacePanel = hasContext(FORM_WORKSPACE_PANEL)
		? getContext<FormWorkspacePanelContext>(FORM_WORKSPACE_PANEL)
		: fallbackPanelState;
	const activeWorkspacePanelId = workspacePanel.activePanelId;

	let selectedIndex = $state(0);

	const isStructuredRepeatable = $derived(blocks.length > 0);
	const selectedItem = $derived(value[selectedIndex]);
	const panelId = $derived(fieldPath ? `repeatable:${fieldPath}` : `repeatable:${label}`);
	const isPanelOpen = $derived(
		isStructuredRepeatable && value.length > 0 && $activeWorkspacePanelId === panelId
	);

	function clampSelectedIndex() {
		if (value.length === 0) {
			selectedIndex = 0;
			return;
		}

		if (selectedIndex > value.length - 1) {
			selectedIndex = value.length - 1;
		}
	}

	function addItem() {
		const newItem = isStructuredRepeatable ? buildBlockFormData(blocks, {}, blockRegistry) : '';
		value = [...value, newItem];
		selectedIndex = value.length - 1;
		if (isStructuredRepeatable) {
			workspacePanel.setActivePanel(panelId);
		}
		onchange?.();
	}

	function removeItem(index: number) {
		value = value.filter((_, itemIndex) => itemIndex !== index);
		if (selectedIndex >= index) {
			selectedIndex = Math.max(0, selectedIndex - 1);
		}
		clampSelectedIndex();
		onchange?.();
	}

	function selectItem(index: number) {
		selectedIndex = index;
		workspacePanel.setActivePanel(panelId);
	}

	function closePanel() {
		if ($activeWorkspacePanelId === panelId) {
			workspacePanel.setActivePanel(null);
		}
	}

	function updatePrimitiveItem(index: number, nextValue: string) {
		value = value.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
		onchange?.();
	}

	$effect(() => {
		clampSelectedIndex();

		if (isStructuredRepeatable && value.length === 0 && $activeWorkspacePanelId === panelId) {
			workspacePanel.setActivePanel(null);
		}
	});
</script>

<fieldset class="mb-4">
	<div class="mb-2 flex items-center justify-between gap-3">
		<legend class="text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</legend>
		<button
			type="button"
			onclick={addItem}
			class="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-stone-950 px-3 text-xs font-medium text-white hover:bg-stone-800"
		>
			<Plus class="h-3.5 w-3.5" />
			Add item
		</button>
	</div>

	{#if value.length === 0}
		<div class="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
			<p class="mb-1 text-sm font-medium text-gray-700">No items yet</p>
			<p class="text-xs text-gray-500">Add an item to get started.</p>
		</div>
	{:else if !isStructuredRepeatable}
		<div class="grid gap-2">
			{#each value as item, index}
				<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
					<input
						type="text"
						value={item}
						aria-label={`${label} item ${index + 1}`}
						oninput={(event) => updatePrimitiveItem(index, event.currentTarget.value)}
						class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
					/>
					<button
						type="button"
						onclick={() => removeItem(index)}
						class="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-700 hover:bg-red-50"
						aria-label={`Remove item ${index + 1}`}
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid gap-2" aria-label={`${label} items`}>
			{#each value as item, index}
				<button
					type="button"
					class="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-3 text-left text-sm transition-colors"
					class:border-stone-950={selectedIndex === index}
					class:bg-stone-950={selectedIndex === index}
					class:text-white={selectedIndex === index}
					class:border-gray-300={selectedIndex !== index}
					class:bg-white={selectedIndex !== index}
					class:text-stone-800={selectedIndex !== index}
					class:hover:bg-stone-100={selectedIndex !== index}
					onclick={() => selectItem(index)}
					aria-pressed={selectedIndex === index}
				>
					<span class="truncate font-medium">
						{getRepeatableItemLabel(item, index, blocks, itemLabel)}
					</span>
					<span class="h-2 w-2 rounded-full bg-current opacity-50" aria-hidden="true"></span>
				</button>
			{/each}
		</div>

		{#if isPanelOpen}
			<div class="mt-4 rounded-md border border-gray-300 bg-gray-50 p-4 xl:hidden">
				<div class="mb-4 flex items-start justify-between gap-3 border-b border-gray-200 pb-3">
					<div class="min-w-0">
						<p class="text-[0.7rem] font-semibold tracking-[0.16em] text-stone-500 uppercase">
							{itemLabel ?? label}
						</p>
						<h3 class="truncate text-sm font-semibold text-stone-900">
							{getRepeatableItemLabel(selectedItem, selectedIndex, blocks, itemLabel)}
						</h3>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={closePanel}
							class="inline-flex min-h-8 items-center rounded-md border border-stone-300 px-2.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
						>
							Done
						</button>
						<button
							type="button"
							onclick={() => removeItem(selectedIndex)}
							class="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-700 hover:bg-red-50"
						>
							<Trash2 class="h-3.5 w-3.5" />
							Remove
						</button>
					</div>
				</div>

				<div class="grid gap-2">
					{#each blocks as block}
						<FormField
							{block}
							fieldPath={fieldPath ? `${fieldPath}[${selectedIndex}].${block.id}` : block.id}
							bind:value={value[selectedIndex][block.id]}
							{imagePath}
							{blockRegistry}
							onchange={() => onchange?.()}
						/>
					{/each}
				</div>
			</div>
			<aside
				class="hidden xl:flex xl:fixed xl:top-14 xl:right-0 xl:z-20 xl:h-[calc(100vh-3.5rem)] xl:w-[22rem] xl:flex-col xl:border-l xl:border-stone-200 xl:bg-white"
				aria-label={`${label} editor`}
			>
				<div class="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-4">
					<div class="min-w-0">
						<p class="text-[0.7rem] font-semibold tracking-[0.16em] text-stone-500 uppercase">
							{itemLabel ?? label}
						</p>
						<h3 class="truncate text-sm font-semibold text-stone-900">
							{getRepeatableItemLabel(selectedItem, selectedIndex, blocks, itemLabel)}
						</h3>
					</div>
					<span class="h-2 w-2 rounded-full bg-stone-950" aria-hidden="true"></span>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					<div class="grid gap-2">
						{#each blocks as block}
							<FormField
								{block}
								fieldPath={fieldPath ? `${fieldPath}[${selectedIndex}].${block.id}` : block.id}
								bind:value={value[selectedIndex][block.id]}
								{imagePath}
								{blockRegistry}
								onchange={() => onchange?.()}
							/>
						{/each}
					</div>
				</div>

				<div class="flex items-center gap-2 border-t border-stone-200 px-4 py-4">
					<button
						type="button"
						onclick={closePanel}
						class="inline-flex min-h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white hover:bg-stone-800"
					>
						Done
					</button>
					<button
						type="button"
						onclick={() => removeItem(selectedIndex)}
						class="inline-flex min-h-9 items-center justify-center rounded-md bg-stone-100 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
					>
						Remove
					</button>
				</div>
			</aside>
		{/if}
	{/if}
</fieldset>
