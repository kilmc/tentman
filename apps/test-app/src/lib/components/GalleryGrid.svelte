<script lang="ts">
	import type { GalleryItem } from '$lib/content/types';

	let {
		items,
		title = 'Gallery',
		description
	}: {
		items: GalleryItem[];
		title?: string;
		description?: string;
	} = $props();
</script>

{#if items.length > 0}
	<section class="stack-lg">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Reusable block</p>
				<h2>{title}</h2>
			</div>

			{#if description}
				<p class="section-copy">{description}</p>
			{/if}
		</div>

		<div class="gallery-grid">
			{#each items as item (item.image)}
				<figure class="gallery-item">
					<img src={item.image} alt={item.alt} loading="lazy" />
					<figcaption>
						<strong>{item.alt}</strong>
						{#if item.caption}
							<span>{item.caption}</span>
						{/if}
					</figcaption>
				</figure>
			{/each}
		</div>
	</section>
{/if}
