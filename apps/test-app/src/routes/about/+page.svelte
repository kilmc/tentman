<script lang="ts">
	import GalleryGrid from '$lib/components/GalleryGrid.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>About | Tentman Fixture Site</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Singleton JSON page</p>
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
	title="About page gallery"
	description="This section uses the reusable `imageGallery` block, which makes it a handy test for nested repeated content."
/>
