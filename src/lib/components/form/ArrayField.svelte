<script lang="ts">
	import { getContext, hasContext } from 'svelte';
	import { writable } from 'svelte/store';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME, dragHandle, dragHandleZone } from 'svelte-dnd-action';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import type { BlockUsage } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import { parseFieldPath } from '$lib/features/forms/edit-session';
	import {
		FORM_WORKSPACE_PANEL,
		type FormWorkspacePanelContext,
		type RepeatableWorkspacePanel
	} from '$lib/features/forms/workspace-panel';
	import { getRepeatableItemLabel } from '$lib/features/forms/repeatable-labels';
	import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
	import AssetImage from '$lib/components/AssetImage.svelte';

	interface Props {
		label: string;
		value: unknown[];
		fieldPath?: string;
		blocks?: BlockUsage[];
		itemLabel?: string;
		required?: boolean;
		onchange?: () => void;
		imagePath?: string;
		blockRegistry: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		onaddselectoption?: (input: { collection: string; id: string; label: string }) => Promise<void>;
	}

	type RepeatableDragItem = {
		id: string;
		index: number;
		item: unknown;
		[SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean;
	};

	let {
		label,
		value = $bindable([]),
		fieldPath,
		blocks = [],
		itemLabel,
		required = false,
		onchange,
		imagePath,
		blockRegistry,
		navigationManifest,
		onaddselectoption
	}: Props = $props();

	const fallbackPanelState = (() => {
		const activePanel = writable<RepeatableWorkspacePanel | null>(null);
		return {
			activePanel,
			setActivePanel(panel: RepeatableWorkspacePanel | null) {
				activePanel.set(panel);
			},
			session: null
		} satisfies FormWorkspacePanelContext;
	})();

	const workspacePanel = hasContext(FORM_WORKSPACE_PANEL)
		? getContext<FormWorkspacePanelContext>(FORM_WORKSPACE_PANEL)
		: fallbackPanelState;
	const activeWorkspacePanel = workspacePanel.activePanel;

	let selectedIndex = $state(0);
	let nextDragId = 0;
	const dragIdsByItem = new WeakMap<object, string>();

	const isStructuredRepeatable = $derived(blocks.length > 0);
	const previewImageBlock = $derived(blocks.find((block) => block.type === 'image') ?? null);
	const panelId = $derived(fieldPath ? `repeatable:${fieldPath}` : `repeatable:${label}`);
	const flipDurationMs = 150;
	const dragItems = $derived(getDragItems());
	const isPanelOpen = $derived(
		isStructuredRepeatable &&
			value.length > 0 &&
			$activeWorkspacePanel?.id === panelId &&
			$activeWorkspacePanel.mode === 'edit'
	);
	const addItemLabel = $derived(`Add ${itemLabel ?? 'item'}`);

	function clampSelectedIndex() {
		if (value.length === 0) {
			selectedIndex = 0;
			return;
		}

		if (selectedIndex > value.length - 1) {
			selectedIndex = value.length - 1;
		}
	}

	function getPanelTitle(index: number) {
		return getRepeatableItemLabel(value[index], index, blocks, itemLabel);
	}

	function getPanelTitleForItem(item: unknown, index: number) {
		return getRepeatableItemLabel(item, index, blocks, itemLabel);
	}

	function getCreatePanelTitle() {
		return `New ${itemLabel ?? 'item'}`;
	}

	function getItemOrdinalLabel(index: number) {
		return `${itemLabel ?? 'Item'} ${index + 1}`;
	}

	function getItemDisplayLabel(index: number) {
		return getItemDisplayLabelForItem(value[index], index);
	}

	function getItemDisplayLabelForItem(item: unknown, index: number) {
		const title = getPanelTitleForItem(item, index);
		const prefix = `${getItemOrdinalLabel(index)}: `;
		if (title === getItemOrdinalLabel(index)) {
			return 'Untitled';
		}
		return title.startsWith(prefix) ? title.slice(prefix.length) : title;
	}

	function getDragItemId(item: unknown, index: number) {
		if (!item || typeof item !== 'object') {
			return `${panelId}:primitive:${index}:${String(item)}`;
		}

		const existingId = dragIdsByItem.get(item);
		if (existingId) {
			return existingId;
		}

		const nextId = `${panelId}:item:${nextDragId}`;
		nextDragId += 1;
		dragIdsByItem.set(item, nextId);
		return nextId;
	}

	function getDragItems(): RepeatableDragItem[] {
		return value.map((item, index) => ({
			id: getDragItemId(item, index),
			index,
			item
		}));
	}

	function getItemImageValue(item: unknown) {
		if (
			!previewImageBlock ||
			!item ||
			typeof item !== 'object' ||
			Array.isArray(item) ||
			typeof (item as ContentRecord)[previewImageBlock.id] !== 'string'
		) {
			return null;
		}

		const imageValue = ((item as ContentRecord)[previewImageBlock.id] as string).trim();
		return imageValue.length > 0 ? imageValue : null;
	}

	function createPanel(index: number): RepeatableWorkspacePanel | null {
		const item = value[index];
		if (
			!workspacePanel.session ||
			!fieldPath ||
			!isStructuredRepeatable ||
			!item ||
			typeof item !== 'object' ||
			Array.isArray(item)
		) {
			return null;
		}

		return {
			id: panelId,
			mode: 'edit',
			label: itemLabel ?? label,
			listLabel: label,
			title: getPanelTitle(index),
			blocks,
			selectedIndex: index,
			selectedItem: item as ContentRecord,
			arrayPath: parseFieldPath(fieldPath),
			fieldPath,
			imagePath,
			blockRegistry,
			navigationManifest,
			onaddselectoption,
			isDirty: false
		};
	}

	function createDraftPanel(): RepeatableWorkspacePanel | null {
		if (!workspacePanel.session || !fieldPath || !isStructuredRepeatable) {
			return null;
		}

		const draftItem = buildBlockFormData(blocks, {}, blockRegistry);
		const draftIndex = value.length;

		return {
			id: panelId,
			mode: 'create',
			label: itemLabel ?? label,
			listLabel: label,
			title: getCreatePanelTitle(),
			blocks,
			selectedIndex: draftIndex,
			selectedItem: draftItem,
			arrayPath: parseFieldPath(fieldPath),
			fieldPath,
			imagePath,
			blockRegistry,
			navigationManifest,
			onaddselectoption,
			isDirty: false
		};
	}

	function openPanel(index: number = selectedIndex) {
		const panel = createPanel(index);
		if (panel) {
			workspacePanel.session?.openPanel(panel);
		}
	}

	function addItem() {
		if (isStructuredRepeatable) {
			const panel = createDraftPanel();
			if (panel) {
				workspacePanel.session?.openPanel(panel);
			}
			return;
		}

		const newItem = '';
		value = [...value, newItem];
		selectedIndex = value.length - 1;
		onchange?.();
	}

	function removeItem(index: number) {
		const nextValue = value.filter((_, itemIndex) => itemIndex !== index);
		value = nextValue;
		if (selectedIndex >= index) {
			selectedIndex = Math.max(0, selectedIndex - 1);
		}
		clampSelectedIndex();
		onchange?.();
	}

	function selectItem(index: number) {
		selectedIndex = index;
		openPanel(index);
	}

	function updatePrimitiveItem(index: number, nextValue: string) {
		value = value.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
		onchange?.();
	}

	function reorderItems(nextItems: RepeatableDragItem[]) {
		const indexMap = new Map(nextItems.map((item, index) => [item.index, index]));
		value = nextItems.map((item) => item.item);
		selectedIndex = indexMap.get(selectedIndex) ?? selectedIndex;

		if (workspacePanel.session && fieldPath) {
			workspacePanel.session.reorderArrayItems(
				parseFieldPath(fieldPath),
				value as ContentValue[],
				indexMap
			);
			return;
		}

		onchange?.();
	}

	function handleDragConsider(event: CustomEvent<DndEvent<RepeatableDragItem>>) {
		reorderItems(event.detail.items);
	}

	function handleDragFinalize(event: CustomEvent<DndEvent<RepeatableDragItem>>) {
		reorderItems(event.detail.items);
	}

	$effect(() => {
		clampSelectedIndex();
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
			class="tm-btn tm-btn-secondary min-h-8 px-3 text-xs"
			aria-label={addItemLabel}
			title={addItemLabel}
		>
			<Plus class="h-3.5 w-3.5" />
			{addItemLabel}
		</button>
	</div>

	{#if value.length === 0}
		<div class="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
			<p class="mb-1 text-sm font-medium text-gray-700">No items yet</p>
			<p class="text-xs text-gray-500">Add an item to get started.</p>
		</div>
	{:else if !isStructuredRepeatable}
		<div class="grid gap-2">
			{#each value as item, index (index)}
				<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
					<input
						type="text"
						value={typeof item === 'string' ? item : ''}
						aria-label={`${label} item ${index + 1}`}
						oninput={(event) => updatePrimitiveItem(index, event.currentTarget.value)}
						class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
					/>
					<button
						type="button"
						onclick={() => removeItem(index)}
						class="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-700 hover:bg-red-50"
						aria-label={`Remove item ${index + 1}`}
						title={`Remove item ${index + 1}`}
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div
			class="grid gap-2"
			aria-label={`${label} items`}
			use:dragHandleZone={{
				items: dragItems,
				type: `repeatable:${fieldPath ?? label}`,
				flipDurationMs,
				delayTouchStart: true
			}}
			onconsider={handleDragConsider}
			onfinalize={handleDragFinalize}
		>
			{#each dragItems as dragItem, index (`${dragItem.id}:${dragItem[SHADOW_ITEM_MARKER_PROPERTY_NAME] ? 'shadow' : 'real'}`)}
				{@const item = dragItem.item}
				{@const imageValue = getItemImageValue(item)}
				<div
					class="grid min-h-10 grid-cols-[auto_minmax(0,1fr)] items-center rounded-md border border-stone-200 bg-white text-sm text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
					class:border-stone-950={isPanelOpen && selectedIndex === index}
					class:bg-stone-100={isPanelOpen && selectedIndex === index}
					class:text-stone-950={isPanelOpen && selectedIndex === index}
					data-is-dnd-shadow-item-hint={dragItem[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
				>
					<button
						type="button"
						use:dragHandle
						class="inline-flex h-full min-h-10 w-9 items-center justify-center text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:outline-none"
						aria-label={`Drag ${getPanelTitleForItem(item, index)}`}
					>
						<GripVertical class="h-4 w-4" />
					</button>
					<button
						type="button"
						class="grid min-h-10 min-w-0 items-center px-3 py-2 text-left"
						onclick={() => selectItem(index)}
						aria-pressed={isPanelOpen && selectedIndex === index}
						aria-label={`Edit ${getPanelTitleForItem(item, index)}`}
						title={`Edit ${getPanelTitleForItem(item, index)}`}
					>
						<span
							class={imageValue
								? 'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3'
								: 'grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-3'}
						>
							{#if imageValue}
								<span
									class="block h-9 w-9 overflow-hidden rounded border border-stone-200 bg-stone-100"
									aria-hidden="true"
									data-testid={`repeatable-preview-${index}`}
								>
									<AssetImage
										value={imageValue}
										alt=""
										assetsDir={previewImageBlock?.assetsDir ?? imagePath}
										class="h-full w-full object-cover"
									/>
								</span>
							{/if}
							<span class="grid min-w-0 gap-0.5">
								<span class="text-[0.68rem] leading-none font-semibold text-stone-500 uppercase">
									{getItemOrdinalLabel(index)}
								</span>
								<span class="truncate font-medium">
									{getItemDisplayLabelForItem(item, index)}
								</span>
							</span>
						</span>
					</button>
				</div>
			{/each}
		</div>

		{#if isPanelOpen}
			<p class="sr-only">{getPanelTitle(selectedIndex)} is open in the editor panel.</p>
		{/if}
	{/if}
</fieldset>
