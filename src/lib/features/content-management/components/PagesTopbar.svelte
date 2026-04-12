<script lang="ts">
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import SidebarClose from 'lucide-svelte/icons/sidebar-close';
	import SidebarOpen from 'lucide-svelte/icons/sidebar-open';
	import UploadCloud from 'lucide-svelte/icons/upload-cloud';

	interface Props {
		title: string;
		previewUrl?: string | null;
		showPublish?: boolean;
		publishHref: string;
		showCollectionToggle?: boolean;
		collectionCollapsed?: boolean;
		onToggleCollection?: () => void;
	}

	let {
		title,
		previewUrl = null,
		showPublish = false,
		publishHref,
		showCollectionToggle = false,
		collectionCollapsed = false,
		onToggleCollection
	}: Props = $props();
</script>

<header
	class="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-stone-200 bg-white px-4 py-2 sm:px-6"
>
	{#if showCollectionToggle}
		<div class="flex min-w-0 items-center gap-2">
			<button
				type="button"
				class="tm-icon-btn tm-icon-btn-ghost"
				onclick={onToggleCollection}
				aria-label={`${collectionCollapsed ? 'Show' : 'Hide'} collection panel`}
			>
				{#if collectionCollapsed}
					<SidebarOpen class="h-4 w-4" />
				{:else}
					<SidebarClose class="h-4 w-4" />
				{/if}
			</button>
			<p class="truncate text-base font-semibold text-stone-950 sm:text-lg">{title}</p>
		</div>
	{:else}
		<div class="min-w-0">
			<h1 class="truncate text-xl font-bold text-stone-950">{title}</h1>
		</div>
	{/if}

	<div class="flex items-center gap-2">
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
