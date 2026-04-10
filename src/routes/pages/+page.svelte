<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';

	let { data }: { data: PageData } = $props();

	const isLocalMode = data.selectedBackend?.kind === 'local';
	let redirecting = $state(false);

	onMount(async () => {
		if (!isLocalMode) {
			return;
		}

		await localContent.refresh();

		const contentState = get(localContent);
		const firstConfig = orderDiscoveredConfigs(
			contentState.configs,
			contentState.navigationManifest.manifest
		)[0];
		if (firstConfig) {
			redirecting = true;
			await goto(resolve(`/pages/${firstConfig.slug}`));
		}
	});
</script>

<div class="mx-auto max-w-3xl py-8">
	{#if isLocalMode && $localRepo.error}
		<div class="rounded-md border border-red-200 bg-red-50 p-4">
			<p class="text-red-800">{$localRepo.error}</p>
		</div>
	{:else if isLocalMode && (redirecting || $localContent.status === 'loading' || $localContent.status === 'idle')}
		<div class="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-600">
			Opening your first page…
		</div>
	{:else if isLocalMode && $localContent.error}
		<div class="rounded-md border border-red-200 bg-red-50 p-4">
			<p class="text-red-800">{$localContent.error}</p>
		</div>
	{:else if redirecting || data.configs.length > 0}
		<div class="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-600">
			Opening your first page…
		</div>
	{:else}
		<div class="rounded-md border border-yellow-200 bg-yellow-50 p-5">
			<h1 class="text-xl font-semibold text-yellow-950">No content configs found</h1>
			<p class="mt-2 text-sm text-yellow-900">
				Create a <code class="rounded bg-yellow-100 px-1">*.tentman.json</code> content config to start
				editing this site.
			</p>
		</div>
	{/if}
</div>
