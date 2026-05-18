	<script lang="ts">
		import { get } from 'svelte/store';
		import { localContent } from '$lib/stores/local-content';

	let rescanVersion = $state(0);

	async function handleRescan() {
		await localContent.refresh({ force: true });
		rescanVersion += 1;
	}
</script>

<button type="button" onclick={() => void handleRescan()}>Rescan repo</button>

{#key rescanVersion}
	{@const config = get(localContent).configs.find((entry) => entry.slug === 'about')?.config ?? null}
	{@const blockLabels = config?.blocks.map((block) => block.label ?? block.id) ?? []}
	<ul>
		{#each blockLabels as label (label)}
			<li>{label}</li>
		{/each}
	</ul>
{/key}
