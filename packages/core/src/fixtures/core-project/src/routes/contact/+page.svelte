<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Contact | Tentman Test App</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Singleton page</p>
	<h1>{data.contact.title}</h1>
	<p class="lead">{data.contact.intro}</p>
</section>

<section class="info-grid">
	<article class="info-item">
		<p class="eyebrow">Email</p>
		<h2><a class="text-link" href={`mailto:${data.contact.email}`}>{data.contact.email}</a></h2>
	</article>

	<article class="info-item">
		<p class="eyebrow">Location</p>
		<h2>{data.contact.location}</h2>
	</article>

	<article class="info-item">
		<p class="eyebrow">Response time</p>
		<h2>{data.contact.responseTime}</h2>
	</article>
</section>

<section class="detail-layout">
	<div class="prose">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.contactHtml}
	</div>

	<div class="schedule-block">
		<p class="eyebrow">Availability</p>
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
