<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME, dragHandle, dragHandleZone } from 'svelte-dnd-action';
	import ArrowDownAZ from 'lucide-svelte/icons/arrow-down-a-z';
	import ArrowUpAZ from 'lucide-svelte/icons/arrow-up-a-z';
	import Check from 'lucide-svelte/icons/check';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import List from 'lucide-svelte/icons/list';
	import Plus from 'lucide-svelte/icons/plus';
	import SidebarClose from 'lucide-svelte/icons/sidebar-close';
	import SidebarOpen from 'lucide-svelte/icons/sidebar-open';
	import Shuffle from 'lucide-svelte/icons/shuffle';
	import X from 'lucide-svelte/icons/x';
	import type {
		CollectionNavigationGroup,
		CollectionNavigationItem
	} from '$lib/features/content-management/navigation';
	import type { NavigationDraftCollection } from '$lib/features/content-management/navigation-draft';
	import type { CollectionIndexItem, CollectionSortMode } from './workspace-types';

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
	};

	const flipDurationMs = 150;

	let collapsed = $state(false);
	let sortMode = $state<CollectionSortMode>('custom');
	let editingCustomOrder = $state(false);
	let editableGroups = $state<EditableGroup[]>([]);
	let editableUngroupedItems = $state<CollectionIndexItem[]>([]);

	const branchQuery = $derived(branch ? `?branch=${encodeURIComponent(branch)}` : '');
	const allItems = $derived([...groups.flatMap((group) => group.items), ...items]);
	const changedCount = $derived(0);
	const visibleItems = $derived.by(() => {
		const flatItems = [...allItems];

		if (sortMode === 'title-asc') {
			return flatItems.sort((left, right) => left.title.localeCompare(right.title));
		}

		if (sortMode === 'title-desc') {
			return flatItems.sort((left, right) => right.title.localeCompare(left.title));
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
		editingCustomOrder = true;
	}

	function cancelCustomOrderEditing() {
		editingCustomOrder = false;
		editableGroups = [];
		editableUngroupedItems = [];
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

	function getItemHref(itemId: string) {
		return `${resolve(`/pages/${slug}/${itemId}/edit`)}${branchQuery}`;
	}

	function getNewHref() {
		return `${resolve(`/pages/${slug}/new`)}${branchQuery}`;
	}
</script>

{#if collapsed}
	<aside
		class="hidden min-h-0 border-r border-stone-200 bg-white lg:flex lg:w-12 lg:flex-col lg:items-center lg:py-3"
		aria-label={label}
	>
		<button
			type="button"
			class="inline-flex h-9 w-9 items-center justify-center rounded-md bg-stone-100 text-stone-800 transition-colors hover:bg-stone-200"
			onclick={() => (collapsed = false)}
			aria-label={`Show ${label} list`}
		>
			<SidebarOpen class="h-4 w-4" />
		</button>
	</aside>
{:else}
	<aside
		class="grid min-h-0 border-b border-stone-200 bg-white lg:w-80 lg:border-r lg:border-b-0"
		aria-label={label}
	>
		<div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
			<header class="border-b border-stone-200 p-3">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<strong class="block truncate text-sm text-stone-950">{label}</strong>
						<span class="mt-0.5 block text-xs text-stone-500">
							{allItems.length}
							{allItems.length === 1 ? 'item' : 'items'}{#if changedCount > 0},
								{changedCount} changed{/if}
						</span>
					</div>
					<div class="flex items-center gap-2">
						<a
							href={getNewHref()}
							class="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-stone-950 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
						>
							<Plus class="h-3.5 w-3.5" />
							New {itemLabel}
						</a>
						<button
							type="button"
							class="hidden h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-stone-800 transition-colors hover:bg-stone-200 lg:inline-flex"
							onclick={() => (collapsed = true)}
							aria-label={`Hide ${label} list`}
						>
							<SidebarClose class="h-4 w-4" />
						</button>
					</div>
				</div>

				<div class="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
					<label class="sr-only" for={`${slug}-sort`}>Sort {label}</label>
					<select
						id={`${slug}-sort`}
						bind:value={sortMode}
						class="min-h-9 rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-800 focus:border-stone-950 focus:ring-1 focus:ring-stone-950 focus:outline-none"
						disabled={editingCustomOrder}
					>
						<option value="custom">Custom</option>
						<option value="title-asc">Title A-Z</option>
						<option value="title-desc">Title Z-A</option>
					</select>

					{#if sortMode === 'title-asc'}
						<ArrowDownAZ class="mt-2.5 h-4 w-4 text-stone-500" />
					{:else if sortMode === 'title-desc'}
						<ArrowUpAZ class="mt-2.5 h-4 w-4 text-stone-500" />
					{:else if canOrderItems}
						<button
							type="button"
							class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-stone-100 px-2.5 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:text-stone-400"
							onclick={beginCustomOrderEditing}
							disabled={editingCustomOrder}
						>
							<Shuffle class="h-3.5 w-3.5" />
							Edit order
						</button>
					{:else}
						<List class="mt-2.5 h-4 w-4 text-stone-400" />
					{/if}
				</div>
			</header>

			<div class="min-h-0 overflow-y-auto p-3">
				{#if editingCustomOrder}
					<div class="mb-3 flex items-center gap-2">
						<button
							type="button"
							class="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-stone-300 px-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100"
							onclick={cancelCustomOrderEditing}
							disabled={savingCustomOrder}
						>
							<X class="h-3.5 w-3.5" />
							Cancel
						</button>
						<button
							type="button"
							class="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-stone-950 px-2 text-xs font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
							onclick={saveCustomOrder}
							disabled={savingCustomOrder}
						>
							<Check class="h-3.5 w-3.5" />
							{savingCustomOrder ? 'Saving...' : 'Save order'}
						</button>
					</div>

					<div class="grid gap-3">
						{#each editableGroups as group (group.id)}
							<section class="rounded-md border border-stone-200 bg-stone-50 p-2">
								<h3 class="px-1 pb-2 text-xs font-semibold text-stone-500 uppercase">
									{group.label}
								</h3>
								<div
									class="grid gap-1"
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
											class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-stone-200 bg-white p-2"
											data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
										>
											<button
												type="button"
												use:dragHandle
												class="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
												aria-label={`Drag ${item.title}`}
											>
												<GripVertical class="h-4 w-4" />
											</button>
											<span class="truncate text-sm font-medium text-stone-800">{item.title}</span>
										</div>
									{/each}
								</div>
							</section>
						{/each}

						<section class="rounded-md border border-stone-200 bg-stone-50 p-2">
							<h3 class="px-1 pb-2 text-xs font-semibold text-stone-500 uppercase">Ungrouped</h3>
							<div
								class="grid gap-1"
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
										class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-stone-200 bg-white p-2"
										data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
									>
										<button
											type="button"
											use:dragHandle
											class="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
											aria-label={`Drag ${item.title}`}
										>
											<GripVertical class="h-4 w-4" />
										</button>
										<span class="truncate text-sm font-medium text-stone-800">{item.title}</span>
									</div>
								{/each}
								{#if editableUngroupedItems.length === 0}
									<p
										class="rounded-md border border-dashed border-stone-300 bg-white px-3 py-2 text-sm text-stone-400"
									>
										Drop items here
									</p>
								{/if}
							</div>
						</section>
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
				{:else if sortMode === 'custom'}
					<div class="grid gap-3">
						{#each groups as group (group.id)}
							{#if group.items.length > 0}
								<section class="grid gap-1">
									<h3 class="px-1 text-xs font-semibold text-stone-500 uppercase">
										{group.label}
									</h3>
									{#each group.items as item (item.itemId)}
										<a
											href={getItemHref(item.itemId)}
											class="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors"
											class:bg-stone-950={currentItemId === item.itemId}
											class:text-white={currentItemId === item.itemId}
											class:text-stone-800={currentItemId !== item.itemId}
											class:hover:bg-stone-100={currentItemId !== item.itemId}
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
										href={getItemHref(item.itemId)}
										class="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors"
										class:bg-stone-950={currentItemId === item.itemId}
										class:text-white={currentItemId === item.itemId}
										class:text-stone-800={currentItemId !== item.itemId}
										class:hover:bg-stone-100={currentItemId !== item.itemId}
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
								href={getItemHref(item.itemId)}
								class="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors"
								class:bg-stone-950={currentItemId === item.itemId}
								class:text-white={currentItemId === item.itemId}
								class:text-stone-800={currentItemId !== item.itemId}
								class:hover:bg-stone-100={currentItemId !== item.itemId}
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
{/if}
