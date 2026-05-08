<script lang="ts">
	import GalleryGrid from '$lib/components/GalleryGrid.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>About | Tentman Test App</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Singleton page</p>
	<h1>{data.about.title}</h1>
	<p class="lead">{data.about.intro}</p>
</section>

<section class="stats-grid">
	{#each data.about.highlights as highlight (highlight.label)}
		<article class="metric-card">
			<p class="metric-value">{highlight.value}</p>
			<h2>{highlight.label}</h2>
			{#if highlight.detail}
				<p>{highlight.detail}</p>
			{/if}
		</article>
	{/each}
</section>

<section class="prose">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html data.aboutHtml}
</section>

<GalleryGrid
	items={data.about.gallery}
	title="Reusable image block"
	description="This page uses the shared `imageGallery` block so the fixture still exercises imagery and repeated nested values."
/>
