<script lang="ts">
	import DocsContent from '$lib/docs/DocsContent.svelte';
	import { formatDocsTitle } from '$lib/utils/page-title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{formatDocsTitle(data.doc.title)}</title>
</svelte:head>

<DocsContent doc={data.doc} />
