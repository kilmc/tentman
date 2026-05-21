<script lang="ts">
	import DocsContent from '$lib/docs/DocsContent.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.doc.title} | Tentman docs</title>
</svelte:head>

<DocsContent doc={data.doc} />
