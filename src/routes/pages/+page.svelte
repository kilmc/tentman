<script lang="ts">
	import { slugify } from '$lib/utils';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<ul>
	{#each data.examples as example}
		<li><a href="/pages/{slugify(example.label)}">{example.label}</a></li>
	{/each}
</ul>
