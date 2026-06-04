<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import DocsSidebar from '$lib/docs/DocsSidebar.svelte';
	import type { DocsPage } from '$lib/docs/content';

	let { children } = $props<{ children?: Snippet }>();

	const currentDoc = $derived((page.data.doc as DocsPage | undefined) ?? null);
	const sectionLabel = $derived.by(() => {
		const section = currentDoc?.section;

		switch (section) {
			case 'getting-started':
				return 'Getting started';
			case 'guides':
				return 'Guides';
			case 'reference':
				return 'Reference';
			case 'examples':
				return 'Examples';
			default:
				return 'Docs';
		}
	});
</script>

<div class="bg-stone-50">
	<div
		class="mx-auto grid max-w-[104rem] grid-cols-1 gap-0 xl:grid-cols-[19.5rem_minmax(0,1fr)] xl:gap-6 xl:px-4"
	>
		<div class="hidden xl:block">
			<DocsSidebar />
		</div>

		<main class="min-w-0 px-4 py-8 sm:px-6 lg:px-8 xl:px-0">
			<div class="xl:hidden">
				<div class="mb-6 rounded-2xl border border-stone-200 bg-white shadow-sm">
					<DocsSidebar />
				</div>
			</div>
			{#if currentDoc}
				<div class="mb-4 text-sm font-medium text-stone-500 xl:hidden">{sectionLabel}</div>
			{/if}
			{@render children?.()}
		</main>
	</div>
</div>
