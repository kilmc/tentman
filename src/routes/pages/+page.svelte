<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="container mx-auto p-6">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Content Manager</h1>
		<p class="mt-2 text-gray-600">
			Repository: <span class="font-semibold">{data.repo.full_name}</span>
		</p>
	</div>

	{#if data.configs.length === 0}
		<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
			<p class="text-yellow-800">
				No configuration files found in this repository. Create <code
					class="rounded bg-yellow-100 px-1">*.tentman.json</code
				> files to define your content structure.
			</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.configs as config}
				<a
					href="/pages/{config.slug}"
					class="block rounded-lg border border-gray-200 p-4 transition-all hover:border-blue-500 hover:shadow-md"
				>
					<div class="flex items-start justify-between">
						<div>
							<h3 class="text-lg font-semibold">{config.config.label}</h3>
							<p class="mt-1 text-sm text-gray-500 capitalize">{config.type}</p>
						</div>
						<span class="rounded bg-gray-100 px-2 py-1 text-xs">{config.type}</span>
					</div>
					<p class="mt-2 truncate text-xs text-gray-400">{config.path}</p>
				</a>
			{/each}
		</div>
	{/if}
</div>
