<script lang="ts">
	interface Props {
		uploadError?: string | null;
		componentLoadError?: string | null;
	}

	let { uploadError = null, componentLoadError = null }: Props = $props();
</script>

{#if uploadError}
	<div class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
		{uploadError}
	</div>
{/if}

{#if componentLoadError}
	<div class="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
		<p class="font-medium">Content component issue</p>
		<p class="mt-1 text-amber-800">{componentLoadError}</p>
	</div>
{/if}
