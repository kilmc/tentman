<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import { get } from 'svelte/store';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ContentValueDisplay from '$lib/components/content/ContentValueDisplay.svelte';
	import { getContentItemTitle } from '$lib/features/content-management/navigation';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { fetchContentDocument } from '$lib/content/service';
	import { findContentItem } from '$lib/features/content-management/item';

	let { data }: { data: PageData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let packageBlocks = $state<SerializablePackageBlock[]>(data.packageBlocks ?? []);
	let blockRegistryError = $state<string | null>(data.blockRegistryError ?? null);
	let localBlockRegistry = $state<BlockRegistry | null>(null);
	let item = $state(data.item);
	let contentError = $state(data.contentError);
	let localLoadRequest = 0;

	const config = $derived(discoveredConfig?.config ?? null);
	const blockRegistry = $derived.by(() => {
		if (blockRegistryError) {
			return null;
		}

		return isLocalMode ? localBlockRegistry : createBlockRegistry(blockConfigs, { packageBlocks });
	});
	const itemTitle = $derived(
		config && item ? getContentItemTitle(config, item as ContentRecord) : data.itemId
	);

	function applyRemoteData() {
		discoveredConfig = data.discoveredConfig;
		blockConfigs = data.blockConfigs ?? [];
		packageBlocks = data.packageBlocks ?? [];
		blockRegistryError = data.blockRegistryError ?? null;
		localBlockRegistry = null;
		item = data.item;
		contentError = data.contentError;
	}

	async function loadLocalItem(pageSlug: string, itemId: string) {
		const requestId = ++localLoadRequest;

		item = null;
		contentError = null;
		await localContent.refresh();

		const repoState = get(localRepo);
		const contentState = get(localContent);

		if (requestId !== localLoadRequest) {
			return;
		}

		discoveredConfig = contentState.configs.find((entry) => entry.slug === pageSlug) ?? null;
		blockConfigs = contentState.blockConfigs;
		packageBlocks = [];
		blockRegistryError = contentState.blockRegistryError;
		localBlockRegistry = contentState.blockRegistry;

		if (!repoState.backend || !discoveredConfig) {
			contentError = 'Configuration not found';
			return;
		}

		if (!localBlockRegistry) {
			contentError = contentState.blockRegistryError ?? 'Block registry is still loading';
			return;
		}

		try {
			const loadedContent = await fetchContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path
			);

			if (requestId !== localLoadRequest) {
				return;
			}

			if (Array.isArray(loadedContent)) {
				item = findContentItem(loadedContent, discoveredConfig.config, itemId) ?? null;
			}
		} catch (error) {
			if (requestId !== localLoadRequest) {
				return;
			}

			contentError = error instanceof Error ? error.message : 'Failed to load content';
		}
	}

	$effect(() => {
		if (isLocalMode) {
			void loadLocalItem(data.pageSlug, data.itemId);
			return;
		}

		localLoadRequest += 1;
		applyRemoteData();
	});
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href={resolve(`/pages/${data.pageSlug}`)} class="text-sm text-blue-600 hover:underline">
			&larr; Back
		</a>
	</div>

	{#if contentError}
		<div class="rounded-lg border border-red-200 bg-red-50 p-6">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if item === null || !config || !blockRegistry}
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else}
		<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 bg-gray-50 px-4 py-4 sm:flex sm:items-start sm:justify-between sm:px-6">
				<div>
					<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{itemTitle}</h1>
					<p class="mt-1 text-sm text-gray-600">{config.label}</p>
				</div>
				<a
					href={resolve(`/pages/${data.pageSlug}/${data.itemId}/edit`)}
					class="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:mt-0"
				>
					Edit Item
				</a>
			</div>

			<div class="p-4 sm:p-6">
				<dl class="space-y-6">
					{#each config.blocks as block (block.id)}
						<div class="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
							<dt class="mb-2 text-sm font-semibold text-gray-700">{block.label ?? block.id}</dt>
							<dd class="text-gray-900">
								<ContentValueDisplay
									{block}
									value={(item as ContentRecord)[block.id]}
									{blockRegistry}
								/>
							</dd>
						</div>
					{/each}
				</dl>
			</div>
		</div>
	{/if}
</div>
