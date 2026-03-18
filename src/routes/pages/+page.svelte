<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';

	let { data }: { data: PageData } = $props();

	const isLocalMode = data.selectedBackend?.kind === 'local';
	const configs = $derived(isLocalMode ? $localContent.configs : data.configs);

	onMount(async () => {
		if (isLocalMode) {
			await localContent.refresh();
		}
	});
</script>

<div class="container mx-auto p-6">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Content Manager</h1>
		{#if isLocalMode}
			<p class="mt-2 text-gray-600">
				Local repository: <span class="font-semibold">{data.selectedBackend?.repo.name}</span>
			</p>
			{#if $localContent.rootConfig?.local?.previewUrl}
				<p class="mt-1 text-sm text-gray-500">
					Local preview:
					<a
						href={$localContent.rootConfig.local.previewUrl}
						target="_blank"
						rel="noreferrer"
						class="text-blue-600 hover:underline"
					>
						{$localContent.rootConfig.local.previewUrl}
					</a>
				</p>
			{/if}
		{:else}
			{#if 'full_name' in data.repo}
				<p class="mt-2 text-gray-600">
					Repository: <span class="font-semibold">{data.repo.full_name}</span>
				</p>
			{/if}
		{/if}
	</div>

	{#if isLocalMode && $localRepo.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-red-800">{$localRepo.error}</p>
		</div>
	{:else if isLocalMode && $localContent.status === 'loading'}
		<div class="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
			Loading local repository content...
		</div>
	{:else if isLocalMode && $localContent.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-red-800">{$localContent.error}</p>
		</div>
	{:else if configs.length === 0}
		<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
			<p class="text-yellow-800">
				No configuration files found in this repository. Create <code
					class="rounded bg-yellow-100 px-1">*.tentman.json</code
				> files to define your content structure.
			</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each configs as config}
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
