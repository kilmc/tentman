<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		attributes?: Record<string, unknown>;
	}

	let { children, attributes = {} }: Props = $props();

	const audioAttributes = $derived({
		...attributes,
		controls:
			attributes.controls === undefined && !attributes.autoplay
				? true
				: attributes.controls !== false && attributes.controls !== undefined
	} as Omit<svelteHTML.IntrinsicElements['audio'], 'children'>);
</script>

<audio {...audioAttributes}>{@render children?.()}</audio>
