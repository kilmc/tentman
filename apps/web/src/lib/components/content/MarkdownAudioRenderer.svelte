<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		attributes?: Record<string, unknown>;
	}

	let { children, attributes = {} }: Props = $props();

	function hasAttribute(name: string): boolean {
		return Object.hasOwn(attributes, name);
	}

	const audioAttributes = $derived({
		...attributes,
		controls: hasAttribute('controls') || !hasAttribute('autoplay')
	} as Omit<svelteHTML.IntrinsicElements['audio'], 'children'>);
</script>

<audio {...audioAttributes}>{@render children?.()}</audio>
