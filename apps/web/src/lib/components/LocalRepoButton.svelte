<script lang="ts">
	import { localRepo } from '$lib/stores/local-repo';

	interface Props {
		label?: string;
		class?: string;
	}

	let { label = 'Open repo', class: className = '' }: Props = $props();
</script>

<button type="button" class={className} onclick={() => localRepo.open()}>
	{label}
</button>

{#if $localRepo.error}
	<p class="mt-2 text-sm text-red-600">{$localRepo.error}</p>
{/if}
