<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { discoveredConfig, repo } = data;
	const { config, type, path } = discoveredConfig;
</script>

<div class="container mx-auto p-6">
	<div class="mb-6">
		<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to all content</a>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold">{config.label}</h1>
		<div class="mt-2 flex gap-3 text-sm text-gray-600">
			<span class="capitalize">Type: {type}</span>
			<span>•</span>
			<span class="font-mono text-xs">{path}</span>
		</div>
	</div>

	<div class="rounded-lg border border-blue-200 bg-blue-50 p-6">
		<h2 class="mb-2 font-semibold">Configuration Discovered</h2>
		<p class="mb-4 text-sm text-gray-700">
			This {type} configuration has been successfully loaded from the repository.
		</p>

		<div class="rounded border border-gray-200 bg-white p-4">
			<h3 class="mb-2 text-sm font-semibold">Fields:</h3>
			<ul class="space-y-1 text-sm">
				{#each Object.entries(config.fields) as [fieldName, fieldDef]}
					<li class="flex gap-2">
						<span class="font-mono text-blue-600">{fieldName}</span>
						<span class="text-gray-400">→</span>
						<span class="text-gray-600">
							{typeof fieldDef === 'string' ? fieldDef : fieldDef.type}
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-4 text-sm text-gray-600">
			<p>
				<strong>Next step:</strong> Phase 3 will implement content fetching and display for this {type}.
			</p>
		</div>
	</div>
</div>
