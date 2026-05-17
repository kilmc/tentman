<script lang="ts">
	import GalleryGrid from '$lib/components/GalleryGrid.svelte';
	import type { AboutGallery } from '$lib/content/types';

	let { gallery }: { gallery: AboutGallery } = $props();
</script>

<GalleryGrid items={gallery.items} title={gallery.title} description={gallery.description} />
