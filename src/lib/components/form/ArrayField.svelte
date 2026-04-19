<script lang="ts">
	import { getContext, hasContext } from 'svelte';
	import { get, writable } from 'svelte/store';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import type { BlockUsage } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
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
		const activePanel = writable<RepeatableWorkspacePanel | null>(null);
		return {
			activePanel,
			setActivePanel(panel: RepeatableWorkspacePanel | null) {
				activePanel.set(panel);
			}
		} satisfies FormWorkspacePanelContext;
	})();

	const workspacePanel = hasContext(FORM_WORKSPACE_PANEL)
		? getContext<FormWorkspacePanelContext>(FORM_WORKSPACE_PANEL)
		: fallbackPanelState;
	const activeWorkspacePanel = workspacePanel.activePanel;

	let selectedIndex = $state(0);

	const isStructuredRepeatable = $derived(blocks.length > 0);
	const previewImageBlock = $derived(blocks.find((block) => block.type === 'image') ?? null);
	const panelId = $derived(fieldPath ? `repeatable:${fieldPath}` : `repeatable:${label}`);
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

	function getCreatePanelTitle() {
		return `New ${itemLabel ?? 'item'}`;
	}

	function getItemOrdinalLabel(index: number) {
		return `${itemLabel ?? 'Item'} ${index + 1}`;
	}

	function getItemDisplayLabel(index: number) {
		const title = getPanelTitle(index);
		const prefix = `${getItemOrdinalLabel(index)}: `;
		if (title === getItemOrdinalLabel(index)) {
			return 'Untitled';
		}
		return title.startsWith(prefix) ? title.slice(prefix.length) : title;
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

	function getFieldKey() {
		const segment = fieldPath?.split('.').at(-1);
		return segment?.replace(/\[\d+\]$/, '') ?? null;
	}

	function getPreviousPanelWithValue(nextValue: unknown[]) {
		const activePanel = get(activeWorkspacePanel);
		const previousPanel =
			activePanel?.id === panelId ? (activePanel.previousPanel ?? null) : (activePanel ?? null);
		return applyValueToPreviousPanel(previousPanel, nextValue);
	}

	function applyValueToPreviousPanel(
		previousPanel: RepeatableWorkspacePanel | null,
		nextValue: unknown[]
	) {
		const fieldKey = getFieldKey();

		if (!previousPanel || !fieldKey) {
			return previousPanel;
		}

		return {
			...previousPanel,
			selectedItem: {
				...previousPanel.selectedItem,
				[fieldKey]: nextValue as ContentValue
			}
		} satisfies RepeatableWorkspacePanel;
	}

	function removePanelItem(index: number, previousPanel: RepeatableWorkspacePanel | null) {
		const nextValue = value.filter((_, itemIndex) => itemIndex !== index);
		value = nextValue;
		if (selectedIndex >= index) {
			selectedIndex = Math.max(0, selectedIndex - 1);
		}
		clampSelectedIndex();
		const nextPreviousPanel = applyValueToPreviousPanel(previousPanel, nextValue);
		if (nextPreviousPanel) {
			workspacePanel.setActivePanel(nextPreviousPanel);
		} else if (nextValue.length > 0) {
			openPanel(selectedIndex);
		} else {
			workspacePanel.setActivePanel(null);
		}
		onchange?.();
	}

	function createPanel(index: number): RepeatableWorkspacePanel | null {
		const item = value[index];
		if (!isStructuredRepeatable || !item || typeof item !== 'object' || Array.isArray(item)) {
			return null;
		}

		const previousPanel = getPreviousPanelWithValue(value);

		return {
			id: panelId,
			mode: 'edit',
			label: itemLabel ?? label,
			listLabel: label,
			title: getPanelTitle(index),
			blocks,
			selectedIndex: index,
			selectedItem: item as ContentRecord,
			previousPanel,
			fieldPath,
			imagePath,
			blockRegistry,
			close: () => workspacePanel.setActivePanel(previousPanel),
			remove: () => removePanelItem(index, previousPanel),
			save: (nextItem) => saveStructuredItem(index, nextItem)
		};
	}

	function createDraftPanel(): RepeatableWorkspacePanel | null {
		if (!isStructuredRepeatable) {
			return null;
		}

		const draftItem = buildBlockFormData(blocks, {}, blockRegistry);
		const draftIndex = value.length;
		const previousPanel = getPreviousPanelWithValue(value);

		return {
			id: panelId,
			mode: 'create',
			label: itemLabel ?? label,
			listLabel: label,
			title: getCreatePanelTitle(),
			blocks,
			selectedIndex: draftIndex,
			selectedItem: draftItem,
			previousPanel,
			fieldPath,
			imagePath,
			blockRegistry,
			close: () => workspacePanel.setActivePanel(previousPanel),
			save: (nextItem) => saveStructuredNewItem(nextItem)
		};
	}

	function openPanel(index: number = selectedIndex) {
		const panel = createPanel(index);
		if (panel) {
			workspacePanel.setActivePanel(panel);
		}
	}

	function addItem() {
		if (isStructuredRepeatable) {
			const panel = createDraftPanel();
			if (panel) {
				workspacePanel.setActivePanel(panel);
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
		const previousPanel = getPreviousPanelWithValue(nextValue);
		if (previousPanel) {
			workspacePanel.setActivePanel(previousPanel);
		} else if (nextValue.length > 0) {
			openPanel(selectedIndex);
		} else {
			workspacePanel.setActivePanel(null);
		}
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

	function saveStructuredItem(index: number, nextItem: ContentRecord) {
		const nextValue = value.map((item, itemIndex) =>
			itemIndex === index && item && typeof item === 'object' && !Array.isArray(item)
				? nextItem
				: item
		);
		value = nextValue;
		selectedIndex = index;
		if (get(activeWorkspacePanel)?.id === panelId) {
			openPanel(index);
		}
		onchange?.();
	}

	function saveStructuredNewItem(nextItem: ContentRecord) {
		const nextValue = [...value, nextItem];
		value = nextValue;
		selectedIndex = nextValue.length - 1;
		if (get(activeWorkspacePanel)?.id === panelId) {
			openPanel(selectedIndex);
		}
		onchange?.();
	}

	$effect(() => {
		clampSelectedIndex();

		if (
			isStructuredRepeatable &&
			value.length === 0 &&
			$activeWorkspacePanel?.id === panelId &&
			$activeWorkspacePanel.mode === 'edit'
		) {
			workspacePanel.setActivePanel(getPreviousPanelWithValue(value));
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
		<div class="grid gap-2" aria-label={`${label} items`}>
			{#each value as item, index (index)}
				{@const imageValue = getItemImageValue(item)}
				<button
					type="button"
					class="tm-nav-link grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-r-md border-y border-r border-l-2 border-y-stone-200 border-r-stone-200 px-3 py-2 text-left text-sm"
					class:tm-nav-link-active={isPanelOpen && selectedIndex === index}
					onclick={() => selectItem(index)}
					aria-pressed={isPanelOpen && selectedIndex === index}
					aria-label={`Edit ${getPanelTitle(index)}`}
					title={`Edit ${getPanelTitle(index)}`}
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
								{getItemDisplayLabel(index)}
							</span>
						</span>
					</span>
					<span class="text-xs font-semibold text-stone-500" aria-hidden="true">Edit</span>
				</button>
			{/each}
		</div>

		{#if isPanelOpen}
			<p class="sr-only">{getPanelTitle(selectedIndex)} is open in the editor panel.</p>
		{/if}
	{/if}
</fieldset>
