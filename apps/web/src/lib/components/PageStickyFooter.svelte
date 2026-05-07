<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="sticky bottom-0 z-10 mt-6 py-4">
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 border-t border-stone-200 bg-white"
	></div>
	<div class="flex flex-wrap items-center justify-end gap-3">
		{@render children?.()}
	</div>
</div>
