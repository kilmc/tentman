<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<div class="p-10">
	<h2>{data.label}</h2>

	{#each data.fields as field}
		<label>
			<div>{field.label}</div>
			<input class="bg-yellow-100" type={field.type} />
		</label>
	{/each}
</div>
