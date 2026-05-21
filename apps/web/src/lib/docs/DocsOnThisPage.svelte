<script lang="ts">
	import type { DocsPage } from './content';

	interface Props {
		doc?: DocsPage | null;
	}

	let { doc = null }: Props = $props();
</script>

{#if doc && doc.sections.length > 1}
	<aside class="sticky top-8 hidden xl:block">
		<div class="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
			<p class="text-xs font-semibold tracking-[0.12em] text-stone-500 uppercase">On this page</p>
			<nav class="mt-3 grid gap-1">
				{#each doc.sections as section (section.id)}
					<a
						href={`${doc.href}#${section.id}`}
						class="rounded-md px-2 py-1.5 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
					>
						{section.title}
					</a>
				{/each}
			</nav>
		</div>
	</aside>
{/if}
