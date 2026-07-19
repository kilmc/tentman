<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>News | Tentman Fixture Site</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Generated singleton page</p>
	<h1>{data.page.title}</h1>
	<p class="lead">{data.page.intro}</p>
</section>

<section class="prose">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html data.pageHtml}
</section>
