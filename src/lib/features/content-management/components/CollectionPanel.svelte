<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are resolved before branch query strings are appended */
	import { resolve } from '$app/paths';
	import { flip } from 'svelte/animate';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME, dragHandle, dragHandleZone } from 'svelte-dnd-action';
	import ArrowDownAZ from 'lucide-svelte/icons/arrow-down-a-z';
	import ArrowUpAZ from 'lucide-svelte/icons/arrow-up-a-z';
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';
	import X from 'lucide-svelte/icons/x';
	import type {
		CollectionNavigationGroup,
		CollectionNavigationItem
	} from '$lib/features/content-management/navigation';
	import type { NavigationDraftCollection } from '$lib/features/content-management/navigation-draft';
	import type { CollectionIndexItem, CollectionSortType } from './workspace-types';

	interface Props {
		slug: string;
		label: string;
		itemLabel: string;
		items: CollectionNavigationItem[];
		groups: CollectionNavigationGroup[];
		currentItemId?: string | null;
		branch?: string | null;
		status?: 'idle' | 'loading' | 'ready' | 'error';
		error?: string | null;
		canOrderItems?: boolean;
		savingCustomOrder?: boolean;
		onretry?: () => void;
		onsavecustomorder?: (collection: NavigationDraftCollection) => void;
	}

	let {
		slug,
		label,
		itemLabel,
		items,
		groups,
		currentItemId = null,
		branch = null,
		status = 'ready',
		error = null,
		canOrderItems = false,
		savingCustomOrder = false,
		onretry,
		onsavecustomorder
	}: Props = $props();

	type EditableGroup = {
		id: string;
		label: string;
		items: CollectionIndexItem[];
		isDndShadowItem?: boolean;
		[key: string]: unknown;
	};

	const flipDurationMs = 150;

	let sortType = $state<CollectionSortType>('custom');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let editingCustomOrder = $state(false);
	let editableGroups = $state<EditableGroup[]>([]);
	let editableUngroupedItems = $state<CollectionIndexItem[]>([]);
	let draggingGroup = $state(false);
	let sortMenu = $state<HTMLDetailsElement | null>(null);

	const branchQuery = $derived(branch ? `?branch=${encodeURIComponent(branch)}` : '');
	const allItems = $derived([...groups.flatMap((group) => group.items), ...items]);
	const hasDateSort = $derived(allItems.some((item) => item.sortDate !== null));
	const visibleItems = $derived.by(() => {
		const flatItems = [...allItems];

		if (sortType === 'title') {
			return flatItems.sort((left, right) => {
				const direction = sortDirection === 'asc' ? 1 : -1;
				return direction * left.title.localeCompare(right.title);
			});
		}

		if (sortType === 'date') {
			return flatItems.sort((left, right) => {
				const leftDate = left.sortDate ?? Number.NEGATIVE_INFINITY;
				const rightDate = right.sortDate ?? Number.NEGATIVE_INFINITY;

				if (leftDate === rightDate) {
					return left.title.localeCompare(right.title);
				}

				return sortDirection === 'asc' ? leftDate - rightDate : rightDate - leftDate;
			});
		}

		return flatItems;
	});

	function toEditableItem(item: CollectionNavigationItem): CollectionIndexItem {
		return {
			id: item.itemId,
			title: item.title
		};
	}

	function beginCustomOrderEditing() {
		editableGroups = groups.map((group) => ({
			id: group.id,
			label: group.label,
			items: group.items.map(toEditableItem)
		}));
		editableUngroupedItems = items.map(toEditableItem);
		draggingGroup = false;
		editingCustomOrder = true;
	}

	function cancelCustomOrderEditing() {
		editingCustomOrder = false;
		editableGroups = [];
		editableUngroupedItems = [];
		draggingGroup = false;
	}

	function saveCustomOrder() {
		onsavecustomorder?.({
			ungroupedItems: editableUngroupedItems.map((item) => item.id),
			groups: editableGroups.map((group) => ({
				id: group.id,
				label: group.label,
				items: group.items.map((item) => item.id)
			}))
		});
		editingCustomOrder = false;
		draggingGroup = false;
	}

	function updateGroupItems(groupId: string, nextItems: CollectionIndexItem[]) {
		editableGroups = editableGroups.map((group) =>
			group.id === groupId ? { ...group, items: nextItems } : group
		);
	}

	function handleGroupConsider(groupId: string, event: CustomEvent<DndEvent<CollectionIndexItem>>) {
		updateGroupItems(groupId, event.detail.items);
	}

	function handleGroupFinalize(groupId: string, event: CustomEvent<DndEvent<CollectionIndexItem>>) {
		updateGroupItems(groupId, event.detail.items);
	}

	function handleUngroupedConsider(event: CustomEvent<DndEvent<CollectionIndexItem>>) {
		editableUngroupedItems = event.detail.items;
	}

	function handleUngroupedFinalize(event: CustomEvent<DndEvent<CollectionIndexItem>>) {
		editableUngroupedItems = event.detail.items;
	}

	function handleGroupOrderConsider(event: CustomEvent<DndEvent<EditableGroup>>) {
		editableGroups = event.detail.items;
	}

	function handleGroupOrderFinalize(event: CustomEvent<DndEvent<EditableGroup>>) {
		editableGroups = event.detail.items;
		draggingGroup = false;
	}

	function beginGroupDragPreview() {
		draggingGroup = true;
	}

	function endGroupDragPreview() {
		draggingGroup = false;
	}

	function getItemLinkLabel(item: CollectionNavigationItem) {
		return currentItemId === item.itemId ? `${item.title}, current ${itemLabel}` : item.title;
	}

	function toggleSortDirection() {
		if (sortType === 'custom') {
			return;
		}

		sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
	}

	function getSortButtonLabel() {
		if (sortType === 'title') {
			return sortDirection === 'asc' ? 'A-Z' : 'Z-A';
		}

		if (sortType === 'date') {
			return sortDirection === 'asc' ? 'Oldest' : 'Newest';
		}

		return canOrderItems ? 'Customize' : 'Manual';
	}

	function chooseSortType(nextSortType: CollectionSortType) {
		if (nextSortType === 'date' && !hasDateSort) {
			return;
		}

		sortType = nextSortType;
		sortDirection = nextSortType === 'date' ? 'desc' : 'asc';

		if (sortMenu) {
			sortMenu.open = false;
		}
	}
</script>

<aside
	class="grid min-h-0 min-w-0 border-b border-stone-200 bg-white lg:border-r lg:border-b-0"
	aria-label={label}
>
	<div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
		<header class="border-b border-stone-200 px-3 py-3">
			<div class="flex items-center justify-between gap-2">
				<div class="flex min-w-0 items-center gap-2">
					{#if sortType === 'custom'}
						{#if canOrderItems}
							<button
								type="button"
								class="tm-btn tm-btn-secondary min-h-9 px-3 text-xs"
								onclick={beginCustomOrderEditing}
								disabled={editingCustomOrder}
								aria-label="Customize order"
							>
								<Pencil class="h-3.5 w-3.5" />
								{getSortButtonLabel()}
							</button>
						{:else}
							<div
								class="tm-btn tm-btn-secondary min-h-9 px-3 text-xs opacity-60"
								aria-hidden="true"
							>
								{getSortButtonLabel()}
							</div>
						{/if}
					{:else}
						<button
							type="button"
							class="tm-btn tm-btn-secondary min-h-9 px-3 text-xs"
							onclick={toggleSortDirection}
							aria-label={sortType === 'title'
								? `Sort ${sortDirection === 'asc' ? 'Z-A' : 'A-Z'}`
								: `Sort by date ${sortDirection === 'asc' ? 'newest first' : 'oldest first'}`}
						>
							{#if sortType === 'title'}
								{#if sortDirection === 'asc'}
									<ArrowDownAZ class="h-3.5 w-3.5" />
								{:else}
									<ArrowUpAZ class="h-3.5 w-3.5" />
								{/if}
							{:else if sortDirection === 'asc'}
								<span aria-hidden="true" class="text-sm leading-none">↓</span>
							{:else}
								<span aria-hidden="true" class="text-sm leading-none">↑</span>
							{/if}
							{getSortButtonLabel()}
						</button>
					{/if}

					<details bind:this={sortMenu} class="relative">
						<summary class="tm-icon-btn list-none">
							<span class="sr-only">Choose sort type</span>
							<ChevronDown class="h-4 w-4" />
						</summary>
						<div
							class="absolute top-full left-0 z-20 mt-2 grid min-w-36 gap-1 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
						>
							<button
								type="button"
								class="rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
								onclick={() => chooseSortType('title')}
							>
								Alphabetical
							</button>
							<button
								type="button"
								class="rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
								onclick={() => chooseSortType('date')}
								disabled={!hasDateSort}
							>
								Date
							</button>
							<button
								type="button"
								class="rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
								onclick={() => chooseSortType('custom')}
							>
								Custom
							</button>
						</div>
					</details>
				</div>

				<a
					href={resolve(`/pages/${slug}/new`) + branchQuery}
					class="tm-icon-btn"
					aria-label={`New ${itemLabel}`}
				>
					<Plus class="h-4 w-4" />
				</a>
			</div>
		</header>

		<div class="min-h-0 overflow-y-auto p-3">
			{#if editingCustomOrder}
				<div class="grid gap-3 pb-3">
					<div
						class="grid gap-3"
						data-testid="collection-group-order-zone"
						use:dragHandleZone={{
							items: editableGroups,
							type: `collection-groups:${slug}`,
							flipDurationMs,
							delayTouchStart: true
						}}
						onconsider={handleGroupOrderConsider}
						onfinalize={handleGroupOrderFinalize}
					>
						{#each editableGroups as group (`${group.id}:${group.isDndShadowItem ? 'shadow' : 'real'}`)}
							<section
								animate:flip={{ duration: flipDurationMs }}
								class="grid gap-1"
								data-is-dnd-shadow-item-hint={group[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
							>
								<button
									type="button"
									use:dragHandle
									class="grid min-h-5 cursor-grab grid-cols-[auto_minmax(0,1fr)] items-center gap-1 px-1 text-left active:cursor-grabbing"
									aria-label={`Drag ${group.label}`}
									onpointerdown={beginGroupDragPreview}
									onpointerup={endGroupDragPreview}
									onpointercancel={endGroupDragPreview}
								>
									<span
										aria-hidden="true"
										class="inline-flex h-5 w-5 items-center justify-center rounded-md text-stone-400"
									>
										<GripVertical class="h-3.5 w-3.5" />
									</span>
									<h3 class="truncate text-xs font-semibold text-stone-500 uppercase">
										{group.label}
									</h3>
								</button>
								{#if !draggingGroup}
									<div
										class="grid gap-1"
										data-testid={`collection-group-zone-${group.id}`}
										use:dragHandleZone={{
											items: group.items,
											type: `collection-index:${slug}`,
											flipDurationMs,
											delayTouchStart: true
										}}
										onconsider={(event) => handleGroupConsider(group.id, event)}
										onfinalize={(event) => handleGroupFinalize(group.id, event)}
									>
										{#each group.items as item (`${item.id}:${item.isDndShadowItem ? 'shadow' : 'real'}`)}
											<div
												animate:flip={{ duration: flipDurationMs }}
												data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
											>
												<button
													type="button"
													use:dragHandle
													class="tm-nav-link grid min-h-9 w-full cursor-grab grid-cols-[auto_minmax(0,1fr)] items-center gap-1 rounded-r-md px-1 py-1.5 text-left text-sm active:cursor-grabbing"
													aria-label={`Drag ${item.title}`}
												>
													<span
														aria-hidden="true"
														class="inline-flex h-7 w-5 items-center justify-center rounded-md text-stone-400"
													>
														<GripVertical class="h-3.5 w-3.5" />
													</span>
													<span class="truncate font-medium text-stone-800">{item.title}</span>
												</button>
											</div>
										{/each}
									</div>
								{/if}
							</section>
						{/each}
					</div>

					<section class="grid gap-1">
						{#if editableUngroupedItems.length > 0 || !draggingGroup}
							<h3 class="px-1 text-xs font-semibold text-stone-500 uppercase">Ungrouped</h3>
						{/if}
						<div
							class="grid min-h-10 gap-1"
							data-testid="collection-ungrouped-zone"
							use:dragHandleZone={{
								items: editableUngroupedItems,
								type: `collection-index:${slug}`,
								flipDurationMs,
								delayTouchStart: true
							}}
							onconsider={handleUngroupedConsider}
							onfinalize={handleUngroupedFinalize}
						>
							{#each editableUngroupedItems as item (`${item.id}:${item.isDndShadowItem ? 'shadow' : 'real'}`)}
								<div
									animate:flip={{ duration: flipDurationMs }}
									data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
								>
									<button
										type="button"
										use:dragHandle
										class="tm-nav-link grid min-h-9 w-full cursor-grab grid-cols-[auto_minmax(0,1fr)] items-center gap-1 rounded-r-md px-1 py-1.5 text-left text-sm active:cursor-grabbing"
										aria-label={`Drag ${item.title}`}
									>
										<span
											aria-hidden="true"
											class="inline-flex h-7 w-5 items-center justify-center rounded-md text-stone-400"
										>
											<GripVertical class="h-3.5 w-3.5" />
										</span>
										<span class="truncate text-sm font-medium text-stone-800">{item.title}</span>
									</button>
								</div>
							{/each}
							{#if editableUngroupedItems.length === 0}
								<p
									class="rounded-r-md border-l-2 border-dashed border-stone-300 px-3 py-2 text-sm text-stone-400"
								>
									Drop items here
								</p>
							{/if}
						</div>
					</section>

					<div class="sticky bottom-0 -mx-3 mt-1 flex items-center gap-2 border-t border-stone-200 bg-white/95 px-3 pt-3 pb-1 backdrop-blur">
						<button
							type="button"
							class="tm-btn tm-btn-secondary min-h-8 flex-1 px-2 text-xs"
							onclick={cancelCustomOrderEditing}
							disabled={savingCustomOrder}
						>
							<X class="h-3.5 w-3.5" />
							Cancel
						</button>
						<button
							type="button"
							class="tm-btn tm-btn-primary min-h-8 flex-1 px-2 text-xs"
							onclick={saveCustomOrder}
							disabled={savingCustomOrder}
						>
							<Check class="h-3.5 w-3.5" />
							{savingCustomOrder ? 'Saving...' : 'Save order'}
						</button>
					</div>
				</div>
			{:else if status === 'loading' && allItems.length === 0}
				<p class="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-500">Loading items...</p>
			{:else if status === 'error' && allItems.length === 0}
				<div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
					<p>{error ?? "Couldn't load items."}</p>
					<button type="button" class="mt-2 font-semibold underline" onclick={onretry}>
						Retry
					</button>
				</div>
			{:else if allItems.length === 0}
				<p
					class="rounded-md border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500"
				>
					No items yet.
				</p>
			{:else if sortType === 'custom'}
				<div class="grid gap-3">
					{#each groups as group (group.id)}
						{#if group.items.length > 0}
							<section class="grid gap-1">
								<h3 class="px-1 text-xs font-semibold text-stone-500 uppercase">
									{group.label}
								</h3>
								{#each group.items as item (item.itemId)}
									<a
										href={resolve(`/pages/${slug}/${item.itemId}/edit`) + branchQuery}
										class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-r-md px-2.5 py-1.5 text-sm"
										class:tm-nav-link-active={currentItemId === item.itemId}
										aria-label={getItemLinkLabel(item)}
										title={item.title}
									>
										<span class="truncate font-medium">{item.title}</span>
										<span class="h-2 w-2 rounded-full bg-current opacity-0"></span>
									</a>
								{/each}
							</section>
						{/if}
					{/each}

					{#if items.length > 0}
						<section class="grid gap-1">
							{#each items as item (item.itemId)}
								<a
									href={resolve(`/pages/${slug}/${item.itemId}/edit`) + branchQuery}
									class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-r-md px-2.5 py-1.5 text-sm"
									class:tm-nav-link-active={currentItemId === item.itemId}
									aria-label={getItemLinkLabel(item)}
									title={item.title}
								>
									<span class="truncate font-medium">{item.title}</span>
									<span class="h-2 w-2 rounded-full bg-current opacity-0"></span>
								</a>
							{/each}
						</section>
					{/if}
				</div>
			{:else}
				<div class="grid gap-1">
					{#each visibleItems as item (item.itemId)}
						<a
							href={resolve(`/pages/${slug}/${item.itemId}/edit`) + branchQuery}
							class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-r-md px-2.5 py-1.5 text-sm"
							class:tm-nav-link-active={currentItemId === item.itemId}
							aria-label={getItemLinkLabel(item)}
							title={item.title}
						>
							<span class="truncate font-medium">{item.title}</span>
							<span class="h-2 w-2 rounded-full bg-current opacity-0"></span>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</aside>
