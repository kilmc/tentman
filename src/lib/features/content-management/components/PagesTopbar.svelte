<script lang="ts">
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import UploadCloud from 'lucide-svelte/icons/upload-cloud';

	interface Props {
		title: string;
		previewUrl?: string | null;
		showPublish?: boolean;
		publishHref: string;
	}

	let { title, previewUrl = null, showPublish = false, publishHref }: Props = $props();
</script>

<header
	class="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-stone-200 bg-white px-4 py-2"
>
	<div class="min-w-0">
		<h1 class="truncate text-xl font-bold text-stone-950">{title}</h1>
	</div>

	<div class="flex items-center gap-2">
		{#if previewUrl}
			<button
				type="button"
				class="inline-flex min-h-9 items-center gap-2 rounded-md bg-stone-100 px-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:outline-none"
				onclick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
			>
				<ExternalLink class="h-4 w-4" />
				Preview
			</button>
		{/if}

		{#if showPublish}
			<a
				href={publishHref}
				class="inline-flex min-h-9 items-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:outline-none"
			>
				<UploadCloud class="h-4 w-4" />
				Publish
			</a>
		{/if}
	</div>
</header>
