<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME, dragHandle, dragHandleZone } from 'svelte-dnd-action';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import LogOut from 'lucide-svelte/icons/log-out';
	import Navigation from 'lucide-svelte/icons/navigation';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Settings from 'lucide-svelte/icons/settings';
	import Shuffle from 'lucide-svelte/icons/shuffle';
	import X from 'lucide-svelte/icons/x';
	import type { DiscoveredConfig } from '$lib/config/discovery';
	import type { WorkspaceNavItem } from './workspace-types';

	interface Props {
		siteName: string;
		repoLabel?: string | null;
		configs: DiscoveredConfig[];
		currentPageSlug?: string | null;
		isAuthenticated?: boolean;
		isLocalMode?: boolean;
		canEditNavigation?: boolean;
		isEditingNavigation?: boolean;
		preparingNavigationEditor?: boolean;
		savingNavigation?: boolean;
		hasUnsavedNavigationChanges?: boolean;
		topLevelEditorItems?: WorkspaceNavItem[];
		onstartnavigationedit?: () => void;
		oncancelnavigationedit?: () => void;
		onsavenavigationedit?: () => void;
		onnavconsider?: (event: CustomEvent<DndEvent<WorkspaceNavItem>>) => void;
		onnavfinalize?: (event: CustomEvent<DndEvent<WorkspaceNavItem>>) => void;
		onswitchsite?: () => void;
		onrescan?: () => void;
	}

	let {
		siteName,
		repoLabel = null,
		configs,
		currentPageSlug = null,
		isAuthenticated = false,
		isLocalMode = false,
		canEditNavigation = false,
		isEditingNavigation = false,
		preparingNavigationEditor = false,
		savingNavigation = false,
		hasUnsavedNavigationChanges = false,
		topLevelEditorItems = [],
		onstartnavigationedit,
		oncancelnavigationedit,
		onsavenavigationedit,
		onnavconsider,
		onnavfinalize,
		onswitchsite,
		onrescan
	}: Props = $props();

	const flipDurationMs = 150;

	function getTopLevelHref(config: DiscoveredConfig) {
		return resolve(
			config.config.collection ? `/pages/${config.slug}` : `/pages/${config.slug}/edit`
		);
	}
</script>

<aside
	class="grid h-screen min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-stone-200 bg-white p-3"
>
	<div class="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
		<a href={resolve('/pages')} class="grid min-w-0 gap-0.5">
			<strong class="truncate text-base leading-tight text-stone-950">{siteName}</strong>
			{#if repoLabel}
				<span class="truncate font-mono text-xs text-stone-500">{repoLabel}</span>
			{/if}
		</a>

		<details class="relative">
			<summary
				class="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md bg-stone-100 text-stone-800 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:outline-none"
				aria-label="Site settings"
			>
				<Settings class="h-4 w-4" />
			</summary>

			<div
				class="absolute right-0 z-20 mt-2 grid min-w-52 gap-1 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
			>
				<a
					href={resolve('/pages/settings')}
					class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100"
				>
					<Settings class="h-4 w-4" />
					Site settings
				</a>
				{#if canEditNavigation}
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
						onclick={onstartnavigationedit}
						disabled={preparingNavigationEditor || isEditingNavigation}
					>
						<Navigation class="h-4 w-4" />
						Edit navigation
					</button>
				{/if}
				{#if isLocalMode}
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
						onclick={onrescan}
					>
						<RefreshCw class="h-4 w-4" />
						Rescan repo
					</button>
				{/if}
				{#if isAuthenticated}
					<a
						href={resolve('/auth/logout')}
						class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100"
					>
						<LogOut class="h-4 w-4" />
						Logout
					</a>
				{/if}
			</div>
		</details>
	</div>

	<div class="min-h-0 overflow-y-auto">
		{#if isEditingNavigation}
			<div class="mb-3 flex items-center gap-2">
				<button
					type="button"
					class="inline-flex min-h-8 flex-1 items-center justify-center rounded-md border border-stone-300 px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
					onclick={oncancelnavigationedit}
					disabled={savingNavigation}
				>
					Cancel
				</button>
				<button
					type="button"
					class="inline-flex min-h-8 flex-1 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
					onclick={onsavenavigationedit}
					disabled={!hasUnsavedNavigationChanges || savingNavigation}
				>
					{savingNavigation ? 'Saving...' : 'Save'}
				</button>
			</div>
			<p class="mb-3 text-sm text-stone-500">Drag pages to reorder the site navigation.</p>
			<div
				class="grid gap-2"
				use:dragHandleZone={{
					items: topLevelEditorItems,
					type: 'pages-sidebar',
					flipDurationMs,
					delayTouchStart: true
				}}
				onconsider={onnavconsider}
				onfinalize={onnavfinalize}
			>
				{#each topLevelEditorItems as item (`${item.id}:${item.isDndShadowItem ? 'shadow' : 'real'}`)}
					<div
						class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-stone-200 bg-white p-2"
						data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
					>
						<button
							type="button"
							use:dragHandle
							class="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
							aria-label={`Drag ${item.label}`}
						>
							<GripVertical class="h-4 w-4" />
						</button>
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-stone-950">{item.label}</p>
							{#if item.isCollection}
								<p class="text-xs text-stone-500">Collection</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else if configs.length === 0}
			<p class="px-1 py-3 text-sm text-stone-500">No content configs found yet.</p>
		{:else}
			<nav class="grid gap-1" aria-label="Website pages">
				{#each configs as config (config.slug)}
					{@const isSelected = currentPageSlug === config.slug}
					<a
						href={getTopLevelHref(config)}
						class="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors"
						class:bg-stone-950={isSelected}
						class:text-white={isSelected}
						class:text-stone-800={!isSelected}
						class:hover:bg-stone-100={!isSelected}
					>
						<span class="truncate">{config.config.label}</span>
						<span
							class="h-2 w-2 rounded-full bg-transparent ring-1 ring-transparent"
							aria-hidden="true"
						></span>
					</a>
				{/each}
			</nav>
		{/if}
	</div>

	<div class="mt-4 grid gap-2">
		{#if canEditNavigation && !isEditingNavigation}
			<button
				type="button"
				class="inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-400"
				onclick={onstartnavigationedit}
				disabled={preparingNavigationEditor}
			>
				<Shuffle class="h-4 w-4" />
				Edit navigation
			</button>
		{:else if isEditingNavigation}
			<button
				type="button"
				class="inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-950"
				onclick={oncancelnavigationedit}
				disabled={savingNavigation}
			>
				<X class="h-4 w-4" />
				Done editing
			</button>
		{/if}
		<button
			type="button"
			class="inline-flex min-h-9 items-center justify-center rounded-md bg-stone-100 px-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-stone-950 hover:text-white"
			onclick={onswitchsite}
		>
			Switch site
		</button>
	</div>
</aside>
