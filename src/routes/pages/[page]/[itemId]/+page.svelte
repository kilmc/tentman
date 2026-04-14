<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import { get } from 'svelte/store';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
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
	const branchQuery = $derived(data.branch ? `?branch=${encodeURIComponent(data.branch)}` : '');
	const isDraftView = $derived(!isLocalMode && !!data.branch);
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

		discoveredConfig = null;
		blockConfigs = [];
		packageBlocks = [];
		localBlockRegistry = null;
		item = null;
		contentError = null;
		blockRegistryError = null;
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

	$effect(() => {
		if (!data.branch || !data.selectedRepo || isLocalMode) {
			return;
		}

		const repoFullName = `${data.selectedRepo.owner}/${data.selectedRepo.name}`;
		draftBranchStore.setBranch(data.branch, repoFullName);
	});
</script>

<div class="max-w-4xl">
	{#if isDraftView}
		<div class="mb-5 rounded-md border border-stone-200 bg-stone-100 p-3">
			<p class="text-sm font-medium text-stone-900">Viewing draft content</p>
			<p class="mt-1 text-sm text-stone-600">
				This item is being loaded from
				<code class="rounded bg-white px-1 text-xs">{data.branch}</code>
			</p>
		</div>
	{/if}

	{#if contentError}
		<div class="rounded-md border border-red-200 bg-red-50 p-4">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if item === null || !config || !blockRegistry}
		<div class="rounded-md border border-stone-200 bg-white p-8 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else}
		<div class="rounded-md border border-stone-200 bg-white">
			<div
				class="border-b border-stone-200 bg-stone-50 px-4 py-4 sm:flex sm:items-start sm:justify-between"
			>
				<div>
					<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">
						{itemTitle}
					</h1>
					<p class="mt-1 text-sm text-stone-500">{config.label}</p>
				</div>
				<a
					href={resolve(`/pages/${data.pageSlug}/${data.itemId}/edit${branchQuery}`)}
					class="tm-btn tm-btn-secondary mt-4 sm:mt-0"
				>
					Edit
				</a>
			</div>

			<div class="p-4">
				<dl class="space-y-4">
					{#each config.blocks as block (block.id)}
						<div class="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
							<dt class="mb-2 text-sm font-semibold text-stone-700">{block.label ?? block.id}</dt>
							<dd class="text-stone-950">
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
