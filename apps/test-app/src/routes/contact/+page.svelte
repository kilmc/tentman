<script lang="ts">
	import GalleryGrid from '$lib/components/GalleryGrid.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Contact | Tentman Fixture Site</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Singleton JSON page</p>
	<h1>{data.contact.title}</h1>
	<p class="lead">{data.contact.intro}</p>
</section>

<section class="info-grid">
	<article class="info-item">
		<p class="eyebrow">Email</p>
		<h2><a class="text-link" href={`mailto:${data.contact.email}`}>{data.contact.email}</a></h2>
	</article>

	<article class="info-item">
		<p class="eyebrow">Phone</p>
		<h2>{data.contact.phone}</h2>
	</article>

	<article class="info-item">
		<p class="eyebrow">Office</p>
		<h2>{data.contact.office}</h2>
	</article>

	<article class="info-item">
		<p class="eyebrow">Booking</p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<h2><a class="text-link" href={data.contact.bookingUrl}>Schedule a session</a></h2>
	</article>
</section>

<section class="detail-layout">
	<div class="prose">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.contactHtml}
	</div>

	<div class="schedule-block">
		<p class="eyebrow">Office hours</p>
		<ul class="schedule-list">
			{#each data.contact.hours as slot (slot.day)}
				<li>
					<strong>{slot.day}</strong>
					<span>{slot.hours}</span>
				</li>
			{/each}
		</ul>
	</div>
</section>

<GalleryGrid
	items={data.contact.gallery}
	title="Contact page gallery"
	description="Another use of the same reusable gallery block, this time mixed with email, URL, and inline collection fields."
/>
