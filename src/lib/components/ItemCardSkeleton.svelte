<script lang="ts">
	interface Props {
		showBadge?: boolean;
	}

	let { showBadge = false }: Props = $props();
</script>

<div
	class="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm animate-pulse"
	role="status"
	aria-label="Loading content..."
>
	<div class="flex items-start justify-between gap-4">
		<div class="flex-1 min-w-0 space-y-3">
			<!-- Primary field skeleton (title) -->
			<div class="h-7 bg-gray-200 rounded w-3/4"></div>

			<!-- Secondary fields skeleton (metadata) -->
			<div class="space-y-2">
				<div class="h-4 bg-gray-200 rounded w-1/2"></div>
				<div class="h-4 bg-gray-200 rounded w-2/3"></div>
			</div>

			<!-- Filename skeleton (optional) -->
			<div class="h-3 bg-gray-100 rounded w-1/3 mt-3"></div>
		</div>

		<!-- Badge skeleton (optional) -->
		{#if showBadge}
			<div class="flex-shrink-0">
				<div class="h-7 w-20 bg-gray-200 rounded-full"></div>
			</div>
		{/if}
	</div>
</div>
