<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div
	class="sticky bottom-0 z-10 mt-6 border-t border-stone-200 bg-white py-4 [clip-path:inset(0_-100vmax)] [box-shadow:0_0_0_100vmax_white]"
>
	<div class="flex flex-wrap items-center justify-end gap-3">
		{@render children?.()}
	</div>
</div>
