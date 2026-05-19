<script lang="ts">
	import PagesLayout from '../../../routes/pages/+layout.svelte';
	import type { LayoutData } from '../../../routes/pages/$types';

	interface Props {
		data: LayoutData;
	}

	let { data }: Props = $props();
</script>

<PagesLayout {data}>
	<div class="grid gap-3">
		<p class="max-w-2xl text-sm leading-6 text-stone-600">
			Choose an item from the collection panel or open the first entry from the main workspace.
		</p>
		<a href="/pages/blog/hello-world/edit" class="tm-btn tm-btn-secondary">Open first item</a>
	</div>
</PagesLayout>
