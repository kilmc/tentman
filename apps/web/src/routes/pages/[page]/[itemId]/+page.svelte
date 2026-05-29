<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ContentValueDisplay from '$lib/components/content/ContentValueDisplay.svelte';
	import { getContentItemTitle } from '$lib/features/content-management/navigation';
	import {
		getStateBadgeClassName,
		resolveCollectionItemState
	} from '$lib/features/content-management/state';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { toasts } from '$lib/stores/toasts';
	import { fetchContentDocument } from '$lib/content/service';
	import { findContentItemByRoute } from '$lib/features/content-management/item';
	import { buildContentTitleContext, formatAppTitle } from '$lib/utils/page-title';

	let { data }: { data: PageData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	function getInitialDiscoveredConfig() {
		return data.discoveredConfig;
	}

	function getInitialBlockConfigs() {
		return data.blockConfigs ?? [];
	}

	function getInitialPackageBlocks(): SerializablePackageBlock[] {
		return data.packageBlocks ?? [];
	}

	function getInitialBlockRegistryError() {
		return data.blockRegistryError ?? null;
	}

	function getInitialItem() {
		return data.item;
	}

	function getInitialContentError() {
		return data.contentError;
	}

	let discoveredConfig = $state(getInitialDiscoveredConfig());
	let blockConfigs = $state(getInitialBlockConfigs());
	let packageBlocks = $state<SerializablePackageBlock[]>(getInitialPackageBlocks());
	let blockRegistryError = $state<string | null>(getInitialBlockRegistryError());
	let localBlockRegistry = $state<BlockRegistry | null>(null);
	let item = $state(getInitialItem());
	let contentError = $state(getInitialContentError());
	let localLoadRequest = 0;
	const flashMessageKeys = ['published', 'deleted', 'branch'] as const;

	const config = $derived(discoveredConfig?.config ?? null);
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
	const siteName = $derived.by(() =>
		isLocalMode
			? ($localContent.rootConfig?.siteName ?? data.selectedBackend?.repo.name ?? 'Tentman')
			: (data.rootConfig?.siteName ?? data.selectedRepo?.name ?? 'Tentman')
	);
	const documentTitle = $derived.by(() => {
		if (!config) {
			return formatAppTitle(data.itemId, siteName);
		}

		return formatAppTitle(
			buildContentTitleContext({
				kind: 'view-item',
				config,
				item: (item as ContentRecord | null) ?? null
			}),
			siteName
		);
	});
	const resolvedItemState = $derived.by(() => {
		if (!config || !item) {
			return null;
		}

		return resolveCollectionItemState(
			config,
			item as ContentRecord,
			isLocalMode ? $localContent.rootConfig : (data.rootConfig ?? null)
		);
	});

	function applyRemoteData() {
		discoveredConfig = data.discoveredConfig;
		blockConfigs = data.blockConfigs ?? [];
		packageBlocks = data.packageBlocks ?? [];
		blockRegistryError = data.blockRegistryError ?? null;
		localBlockRegistry = null;
		item = data.item;
		contentError = data.contentError;
	}

	async function loadLocalItem(
		pageSlug: string,
		itemId: string
	) {
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
				item = findContentItemByRoute(loadedContent, discoveredConfig.config, itemId) ?? null;
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

	function getFlashMessageKey() {
		const url = new URL(window.location.href);
		const relevantEntries = flashMessageKeys
			.map((key) => [key, url.searchParams.get(key)] as const)
			.filter(([, value]) => value !== null);

		if (relevantEntries.length === 0) {
			return null;
		}

		return `tentman:flash:${url.pathname}?${new URLSearchParams(
			relevantEntries.map(([key, value]) => [key, value ?? ''])
		).toString()}`;
	}

	function handleUrlMessages() {
		const urlParams = new URLSearchParams(window.location.search);
		const flashKey = getFlashMessageKey();

		if (flashKey && sessionStorage.getItem(flashKey) === 'seen') {
			return;
		}

		if (urlParams.get('published') === 'true') {
			toasts.add(
				isLocalMode ? 'Changes saved to local files.' : 'Changes published successfully!',
				'success'
			);
		}

		if (urlParams.get('deleted') === 'true') {
			toasts.add('Item deleted successfully!', 'success');
		}

		if (flashKey) {
			sessionStorage.setItem(flashKey, 'seen');
		}
	}

	onMount(() => {
		handleUrlMessages();
	});
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>

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
					<div class="flex flex-wrap items-center gap-2">
						<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">
							{itemTitle}
						</h1>
						{#if resolvedItemState && resolvedItemState.visibility.header !== false}
							<span
								class={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${getStateBadgeClassName(resolvedItemState.variant)}`}
							>
								{resolvedItemState.label}
							</span>
						{/if}
					</div>
					<p class="mt-1 text-sm text-stone-500">{config.label}</p>
				</div>
				<a
					href={resolve(`/pages/${data.pageSlug}/${data.itemId}/edit`)}
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
									rootBlocks={config.blocks}
									rootContentItem={item as ContentRecord}
								/>
							</dd>
						</div>
					{/each}
				</dl>
			</div>
		</div>
	{/if}
</div>
