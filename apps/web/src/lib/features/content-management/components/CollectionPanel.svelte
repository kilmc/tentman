<script lang="ts">
	import { resolve } from '$app/paths';
	import { flip } from 'svelte/animate';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME, dragHandle, dragHandleZone } from 'svelte-dnd-action';
	import ArrowDownAZ from 'lucide-svelte/icons/arrow-down-a-z';
	import ArrowUpAZ from 'lucide-svelte/icons/arrow-up-a-z';
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';
	import X from 'lucide-svelte/icons/x';
	import type {
		CollectionNavigationGroup,
		CollectionNavigationItem
	} from '$lib/features/content-management/navigation';
	import type {
		CollectionSortValue,
		ResolvedCollectionSort,
		ResolvedCollectionSortCapabilities
	} from '$lib/features/content-management/collection-sorts';
	import type { NavigationDraftCollection } from '$lib/features/content-management/navigation-draft';
	import { getStateBadgeClassName } from '$lib/features/content-management/state';
	import type { CollectionIndexItem } from './workspace-types';

	interface Props {
		slug: string;
		label: string;
		itemLabel: string;
		items: CollectionNavigationItem[];
		groups: CollectionNavigationGroup[];
		currentItemId?: string | null;
		status?: 'idle' | 'loading' | 'ready' | 'error';
		error?: string | null;
		sortCapabilities: ResolvedCollectionSortCapabilities;
		canOrderItems?: boolean;
		savingCustomOrder?: boolean;
		onretry?: () => void;
		onsavecustomorder?: (collection: NavigationDraftCollection) => void;
		onpromoteitem?: (item: CollectionNavigationItem) => void;
	}

	let {
		slug,
		label,
		itemLabel,
		items,
		groups,
		currentItemId = null,
		status = 'ready',
		error = null,
		sortCapabilities,
		canOrderItems = false,
		savingCustomOrder = false,
		onretry,
		onsavecustomorder,
		onpromoteitem
	}: Props = $props();

	type EditableGroup = {
		id: string;
		label: string;
		items: CollectionIndexItem[];
		isDndShadowItem?: boolean;
		[key: string]: unknown;
	};

	const flipDurationMs = 150;

	let sortId = $state<string | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let editingCustomOrder = $state(false);
	let editableGroups = $state<EditableGroup[]>([]);
	let editableUngroupedItems = $state<CollectionIndexItem[]>([]);
	let draggingGroup = $state(false);
	let sortMenu = $state<HTMLDetailsElement | null>(null);
	let collapsedGroupIds = $state<string[]>([]);

	const allItems = $derived([...groups.flatMap((group) => group.items), ...items]);
	const availableSorts = $derived(
		sortCapabilities.sorts.filter((sort) => sort.type !== 'manual' || canOrderItems)
	);
	const currentResolvedSort = $derived(
		sortId === null ? null : (availableSorts.find((sort) => sort.id === sortId) ?? null)
	);
	const shouldShowSortMenu = $derived(availableSorts.length > 1);
	const visibleItems = $derived.by(() => {
		const flatItems = [...allItems];
		const sort = currentResolvedSort;

		if (!sort || sort.type === 'manual') {
			return flatItems;
		}

		if (sort.type === 'title' || sort.type === 'text') {
			return flatItems.sort((left, right) => {
				const direction = sortDirection === 'asc' ? 1 : -1;
				return (
					direction *
					String(getSortValue(left, sort) ?? left.title).localeCompare(
						String(getSortValue(right, sort) ?? right.title)
					)
				);
			});
		}

		if (sort.type === 'date') {
			return flatItems.sort((left, right) => {
				const leftDate = getNumberSortValue(left, sort) ?? Number.NEGATIVE_INFINITY;
				const rightDate = getNumberSortValue(right, sort) ?? Number.NEGATIVE_INFINITY;

				if (leftDate === rightDate) {
					return left.title.localeCompare(right.title);
				}

				return sortDirection === 'asc' ? leftDate - rightDate : rightDate - leftDate;
			});
		}

		return flatItems;
	});

	$effect(() => {
		const defaultSort =
			sortCapabilities.defaultSortId === null
				? availableSorts.length === 1
					? availableSorts[0]
					: null
				: (availableSorts.find((sort) => sort.id === sortCapabilities.defaultSortId) ?? null);

		if (sortId === null && defaultSort === null) {
			return;
		}

		if (currentResolvedSort) {
			return;
		}

		sortId = defaultSort?.id ?? null;
		sortDirection =
			sortCapabilities.defaultDirection ??
			defaultSort?.defaultDirection ??
			(defaultSort?.type === 'date' ? 'desc' : 'asc');
	});

	function getSortValue(
		item: CollectionNavigationItem,
		sort: ResolvedCollectionSort
	): CollectionSortValue {
		if (sort.type === 'title') {
			return item.sortValues?.[sort.id] ?? item.title;
		}

		return item.sortValues?.[sort.id] ?? null;
	}

	function getNumberSortValue(item: CollectionNavigationItem, sort: ResolvedCollectionSort) {
		const value = getSortValue(item, sort);
		return typeof value === 'number' ? value : null;
	}

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
		const stateLabel =
			item.state && item.state.visibility.navigation !== false ? `, ${item.state.label}` : '';
		return currentItemId === item.itemId || currentItemId === item.hrefItemId
			? `${item.title}${stateLabel}, current ${itemLabel}`
			: `${item.title}${stateLabel}`;
	}

	function getItemHref(item: CollectionNavigationItem) {
		return resolve(`/pages/${slug}/${item.hrefItemId ?? item.itemId}/edit`);
	}

	function promoteItem(item: CollectionNavigationItem) {
		onpromoteitem?.(item);
	}

	function isCurrentItem(item: CollectionNavigationItem) {
		return currentItemId === item.itemId || currentItemId === item.hrefItemId;
	}

	function toggleSortDirection() {
		if (!currentResolvedSort || currentResolvedSort.type === 'manual') {
			return;
		}

		sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
	}

	function getSortButtonLabel() {
		if (!currentResolvedSort) {
			return 'Sort';
		}

		if (currentResolvedSort.type === 'manual') {
			return 'Customize';
		}

		if (currentResolvedSort.type === 'title' || currentResolvedSort.type === 'text') {
			return sortDirection === 'asc' ? 'A-Z' : 'Z-A';
		}

		if (currentResolvedSort.type === 'date') {
			return sortDirection === 'asc' ? 'Oldest' : 'Newest';
		}

		return currentResolvedSort.label;
	}

	function chooseSort(nextSort: ResolvedCollectionSort) {
		if (nextSort.type === 'manual' && !canOrderItems) {
			return;
		}

		sortId = nextSort.id;
		sortDirection = nextSort.defaultDirection ?? (nextSort.type === 'date' ? 'desc' : 'asc');

		if (sortMenu) {
			sortMenu.open = false;
		}
	}

	function isGroupCollapsed(groupId: string) {
		return collapsedGroupIds.includes(groupId);
	}

	function toggleGroupCollapsed(groupId: string) {
		collapsedGroupIds = isGroupCollapsed(groupId)
			? collapsedGroupIds.filter((id) => id !== groupId)
			: [...collapsedGroupIds, groupId];
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
					{#if !currentResolvedSort}
						<button
							type="button"
							class="tm-btn tm-btn-secondary min-h-9 px-3 text-xs"
							disabled={!shouldShowSortMenu}
							aria-label="Choose sort type"
						>
							{getSortButtonLabel()}
						</button>
					{:else if currentResolvedSort.type === 'manual'}
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
						<button
							type="button"
							class="tm-btn tm-btn-secondary min-h-9 px-3 text-xs"
							onclick={toggleSortDirection}
							aria-label={currentResolvedSort.type === 'title' ||
							currentResolvedSort.type === 'text'
								? `Sort ${sortDirection === 'asc' ? 'Z-A' : 'A-Z'}`
								: `Sort by date ${sortDirection === 'asc' ? 'newest first' : 'oldest first'}`}
						>
							{#if currentResolvedSort.type === 'title' || currentResolvedSort.type === 'text'}
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

					{#if shouldShowSortMenu}
						<details bind:this={sortMenu} class="relative">
							<summary class="tm-icon-btn list-none">
								<span class="sr-only">Choose sort type</span>
								<ChevronDown class="h-4 w-4" />
							</summary>
							<div
								class="absolute top-full left-0 z-20 mt-2 grid min-w-36 gap-1 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
							>
								{#each availableSorts as sort (sort.id)}
									<button
										type="button"
										class="rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
										onclick={() => chooseSort(sort)}
									>
										{sort.label}
									</button>
								{/each}
							</div>
						</details>
					{/if}
				</div>

				<a href={resolve(`/pages/${slug}/new`)} class="tm-icon-btn" aria-label={`New ${itemLabel}`}>
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
								<div
									class="sticky top-[-0.75rem] z-10 -mx-1 grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1 bg-white/95 px-1 pt-4 pb-1 backdrop-blur"
								>
									<button
										type="button"
										class="inline-flex h-6 w-6 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
										aria-label={`${isGroupCollapsed(group.id) ? 'Expand' : 'Collapse'} ${group.label}`}
										aria-expanded={!isGroupCollapsed(group.id)}
										onclick={() => toggleGroupCollapsed(group.id)}
									>
										{#if isGroupCollapsed(group.id)}
											<ChevronRight class="h-3.5 w-3.5" />
										{:else}
											<ChevronDown class="h-3.5 w-3.5" />
										{/if}
									</button>
									<button
										type="button"
										use:dragHandle
										class="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-stone-400 active:cursor-grabbing"
										aria-label={`Drag ${group.label}`}
										onpointerdown={beginGroupDragPreview}
										onpointerup={endGroupDragPreview}
										onpointercancel={endGroupDragPreview}
									>
										<GripVertical class="h-3.5 w-3.5" />
									</button>
									<h3 class="truncate text-xs font-semibold text-stone-500 uppercase">
										{group.label}
									</h3>
								</div>
								{#if !draggingGroup && !isGroupCollapsed(group.id)}
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

					<div
						class="sticky bottom-0 -mx-3 mt-1 flex items-center gap-2 border-t border-stone-200 bg-white/95 px-3 pt-3 pb-1 backdrop-blur"
					>
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
			{:else if currentResolvedSort?.type === 'manual'}
				<div class="grid gap-3">
					{#each groups as group (group.id)}
						{#if group.items.length > 0}
							<section class="grid gap-1">
								<div
									class="sticky top-[-0.75rem] z-10 -mx-1 bg-white/95 px-1 pt-4 pb-1 backdrop-blur"
								>
									<button
										type="button"
										class="grid min-h-6 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-1 rounded-md px-1 text-left transition-colors hover:bg-stone-100"
										aria-label={`${isGroupCollapsed(group.id) ? 'Expand' : 'Collapse'} ${group.label}`}
										aria-expanded={!isGroupCollapsed(group.id)}
										onclick={() => toggleGroupCollapsed(group.id)}
									>
										<span
											aria-hidden="true"
											class="inline-flex h-5 w-5 items-center justify-center rounded-md text-stone-500"
										>
											{#if isGroupCollapsed(group.id)}
												<ChevronRight class="h-3.5 w-3.5" />
											{:else}
												<ChevronDown class="h-3.5 w-3.5" />
											{/if}
										</span>
										<h3 class="truncate text-xs font-semibold text-stone-500 uppercase">
											{group.label}
										</h3>
									</button>
								</div>
								{#if !isGroupCollapsed(group.id)}
									{#each group.items as item (item.itemId)}
										<a
											href={getItemHref(item)}
											onfocus={() => promoteItem(item)}
											onpointerenter={() => promoteItem(item)}
											onpointerdown={() => promoteItem(item)}
											class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-r-md px-2.5 py-1.5 text-sm"
											class:tm-nav-link-active={isCurrentItem(item)}
											aria-label={getItemLinkLabel(item)}
											title={item.title}
										>
											<span class="truncate font-medium">{item.title}</span>
											{#if item.state && item.state.visibility.navigation !== false}
												<span
													class={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${getStateBadgeClassName(item.state.variant)}`}
												>
													{item.state.label}
												</span>
											{/if}
											<span class="h-2 w-2 rounded-full bg-current opacity-0"></span>
										</a>
									{/each}
								{/if}
							</section>
						{/if}
					{/each}

					{#if items.length > 0}
						<section class="grid gap-1">
							{#each items as item (item.itemId)}
								<a
									href={getItemHref(item)}
									onfocus={() => promoteItem(item)}
									onpointerenter={() => promoteItem(item)}
									onpointerdown={() => promoteItem(item)}
									class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-r-md px-2.5 py-1.5 text-sm"
									class:tm-nav-link-active={isCurrentItem(item)}
									aria-label={getItemLinkLabel(item)}
									title={item.title}
								>
									<span class="truncate font-medium">{item.title}</span>
									{#if item.state && item.state.visibility.navigation !== false}
										<span
											class={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${getStateBadgeClassName(item.state.variant)}`}
										>
											{item.state.label}
										</span>
									{/if}
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
							href={getItemHref(item)}
							onfocus={() => promoteItem(item)}
							onpointerenter={() => promoteItem(item)}
							onpointerdown={() => promoteItem(item)}
							class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-r-md px-2.5 py-1.5 text-sm"
							class:tm-nav-link-active={isCurrentItem(item)}
							aria-label={getItemLinkLabel(item)}
							title={item.title}
						>
							<span class="truncate font-medium">{item.title}</span>
							{#if item.state && item.state.visibility.navigation !== false}
								<span
									class={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${getStateBadgeClassName(item.state.variant)}`}
								>
									{item.state.label}
								</span>
							{/if}
							<span class="h-2 w-2 rounded-full bg-current opacity-0"></span>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</aside>
