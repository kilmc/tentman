<script lang="ts">
	interface Props {
		showBadge?: boolean;
	}

	let { showBadge = false }: Props = $props();
</script>

<div
	class="block animate-pulse rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
	role="status"
	aria-label="Loading content..."
>
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1 space-y-3">
			<!-- Primary field skeleton (title) -->
			<div class="h-7 w-3/4 rounded bg-gray-200"></div>

			<!-- Secondary fields skeleton (metadata) -->
			<div class="space-y-2">
				<div class="h-4 w-1/2 rounded bg-gray-200"></div>
				<div class="h-4 w-2/3 rounded bg-gray-200"></div>
			</div>

			<!-- Filename skeleton (optional) -->
			<div class="mt-3 h-3 w-1/3 rounded bg-gray-100"></div>
		</div>

		<!-- Badge skeleton (optional) -->
		{#if showBadge}
			<div class="flex-shrink-0">
				<div class="h-7 w-20 rounded-full bg-gray-200"></div>
			</div>
		{/if}
	</div>
</div>
