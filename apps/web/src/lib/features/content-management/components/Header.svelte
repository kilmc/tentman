<script lang="ts">
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
	import SidebarClose from 'lucide-svelte/icons/sidebar-close';
	import SidebarOpen from 'lucide-svelte/icons/sidebar-open';
	import UploadCloud from 'lucide-svelte/icons/upload-cloud';
	import {
		getStateBadgeClassName,
		type ResolvedContentState
	} from '$lib/features/content-management/state';

	interface Props {
		title: string;
		state?: ResolvedContentState | null;
		previewUrl?: string | null;
		showPublish?: boolean;
		publishHref: string;
		showSidebarToggle?: boolean;
		sidebarOpen?: boolean;
		onToggleSidebar?: () => void;
		showCollectionToggle?: boolean;
		collectionCollapsed?: boolean;
		onToggleCollection?: () => void;
		collectionOpen?: boolean;
		onOpenCollection?: () => void;
	}

	let {
		title,
		state = null,
		previewUrl = null,
		showPublish = false,
		publishHref,
		showSidebarToggle = false,
		sidebarOpen = false,
		onToggleSidebar,
		showCollectionToggle = false,
		collectionCollapsed = false,
		onToggleCollection,
		collectionOpen = false,
		onOpenCollection
	}: Props = $props();
</script>

<header
	class="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-stone-200 bg-white px-4 py-2 sm:px-6"
>
	<div class="flex min-w-0 items-center gap-2">
		{#if showSidebarToggle}
			<button
				type="button"
				class="tm-icon-btn lg:hidden"
				onclick={() => onToggleSidebar?.()}
				aria-label={sidebarOpen ? 'Close site navigation' : 'Open site navigation'}
				aria-expanded={sidebarOpen}
				title={sidebarOpen ? 'Close site navigation' : 'Open site navigation'}
			>
				<PanelLeftOpen class="h-4 w-4" />
			</button>
		{/if}

		{#if showCollectionToggle}
			<button
				type="button"
				class="tm-btn tm-btn-secondary hidden min-h-9 px-3 text-sm lg:inline-flex"
				onclick={() => onToggleCollection?.()}
				aria-label={`${collectionCollapsed ? 'Show' : 'Hide'} collection panel`}
				title={`${collectionCollapsed ? 'Show' : 'Hide'} collection panel`}
			>
				{#if collectionCollapsed}
					<SidebarOpen class="h-4 w-4" />
				{:else}
					<SidebarClose class="h-4 w-4" />
				{/if}
				Items
			</button>

			<button
				type="button"
				class="tm-btn tm-btn-secondary min-h-9 px-3 text-sm lg:hidden"
				onclick={() => onOpenCollection?.()}
				aria-label={collectionOpen ? 'Hide items panel' : 'Show items panel'}
				aria-expanded={collectionOpen}
			>
				Items
			</button>
		{/if}

		<div class="min-w-0">
			<div class="flex min-w-0 items-center gap-2">
				<h1 class="truncate text-base font-semibold text-stone-950 sm:text-lg">{title}</h1>
				{#if state && state.visibility.header !== false}
					<span
						class={`inline-flex flex-shrink-0 items-center rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${getStateBadgeClassName(state.variant)}`}
					>
						{state.label}
					</span>
				{/if}
			</div>
		</div>
	</div>

	<div class="flex flex-wrap items-center justify-end gap-2">
		{#if previewUrl}
			<button
				type="button"
				class="tm-btn tm-btn-secondary"
				onclick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
			>
				<ExternalLink class="h-4 w-4" />
				Preview
			</button>
		{/if}

		{#if showPublish}
			<a href={publishHref} class="tm-btn tm-btn-primary">
				<UploadCloud class="h-4 w-4" />
				Publish
			</a>
		{/if}
	</div>
</header>
