<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		value: string | number;
		children?: Snippet;
	}

	let { value, children }: Props = $props();
</script>

{#key value}
	{@render children?.()}
{/key}
