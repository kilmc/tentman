<script lang="ts">
	import InstructionsWorkspace from '$lib/features/instructions/InstructionsWorkspace.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<InstructionsWorkspace {data} />
