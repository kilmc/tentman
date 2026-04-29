<script lang="ts">
	import { resolve } from '$app/paths';
	import { DropdownMenu } from 'bits-ui';
	import type { DndEvent } from 'svelte-dnd-action';
	import { SHADOW_ITEM_MARKER_PROPERTY_NAME, dragHandle, dragHandleZone } from 'svelte-dnd-action';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import LogOut from 'lucide-svelte/icons/log-out';
	import Navigation from 'lucide-svelte/icons/navigation';
	import Plus from 'lucide-svelte/icons/plus';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Settings from 'lucide-svelte/icons/settings';
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
		canAddPage?: boolean;
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
		mobile?: boolean;
		onclose?: () => void;
	}

	let {
		siteName,
		repoLabel = null,
		configs,
		currentPageSlug = null,
		isAuthenticated = false,
		isLocalMode = false,
		canEditNavigation = false,
		canAddPage = false,
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
		onrescan,
		mobile = false,
		onclose
	}: Props = $props();

	const flipDurationMs = 150;

	function getTopLevelHref(config: DiscoveredConfig) {
		return resolve(
			config.config.collection ? `/pages/${config.slug}` : `/pages/${config.slug}/edit`
		);
	}
</script>

<aside
	class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-white p-3"
	class:h-full={mobile}
	class:w-full={mobile}
	class:border-r={!mobile}
	class:border-stone-200={!mobile}
	class:shadow-2xl={mobile}
	class:h-dvh={!mobile}
>
	<div class="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
		<a href={resolve('/pages')} class="grid min-w-0 gap-0.5">
			<strong class="truncate text-base leading-tight text-stone-950">{siteName}</strong>
			{#if repoLabel}
				<span class="truncate font-mono text-xs text-stone-500">{repoLabel}</span>
			{/if}
		</a>

		<div class="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-stone-100 text-stone-800 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:outline-none"
					aria-label="Site settings"
				>
					<Settings class="h-4 w-4" />
				</DropdownMenu.Trigger>

				<DropdownMenu.Portal>
					<DropdownMenu.Content
						sideOffset={8}
						align="end"
						class="z-20 grid min-w-52 gap-1 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
					>
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a
									{...props}
									href={resolve('/pages/settings')}
									class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-stone-700 transition-colors outline-none hover:bg-stone-100 data-[highlighted]:bg-stone-100"
								>
									<Settings class="h-4 w-4" />
									Site settings
								</a>
							{/snippet}
						</DropdownMenu.Item>
						{#if canEditNavigation}
							<DropdownMenu.Item
								class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors outline-none hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400 data-[highlighted]:bg-stone-100"
								disabled={preparingNavigationEditor || isEditingNavigation}
								onSelect={onstartnavigationedit}
							>
								<Navigation class="h-4 w-4" />
								Edit navigation
							</DropdownMenu.Item>
						{/if}
						{#if isLocalMode}
							<DropdownMenu.Item
								class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors outline-none hover:bg-stone-100 data-[highlighted]:bg-stone-100"
								onSelect={onrescan}
							>
								<RefreshCw class="h-4 w-4" />
								Rescan repo
							</DropdownMenu.Item>
						{/if}
						{#if isAuthenticated}
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a
										{...props}
										href={resolve('/auth/logout')}
										class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-stone-700 transition-colors outline-none hover:bg-stone-100 data-[highlighted]:bg-stone-100"
									>
										<LogOut class="h-4 w-4" />
										Logout
									</a>
								{/snippet}
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			{#if mobile}
				<button
					type="button"
					class="tm-icon-btn"
					onclick={() => onclose?.()}
					aria-label="Close site navigation"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
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
						class="tm-nav-link grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-r-md px-3 py-2 text-sm font-semibold"
						class:tm-nav-link-active={isSelected}
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
		{#if isEditingNavigation}
			<button
				type="button"
				class="tm-btn tm-btn-ghost"
				onclick={oncancelnavigationedit}
				disabled={savingNavigation}
			>
				<X class="h-4 w-4" />
				Done editing
			</button>
		{:else if canAddPage}
			<a href={resolve('/pages/new')} class="tm-btn tm-btn-ghost">
				<Plus class="h-4 w-4" />
				Add page
			</a>
		{/if}
		<button type="button" class="tm-btn tm-btn-secondary" onclick={onswitchsite}>
			Switch site
		</button>
	</div>
</aside>
