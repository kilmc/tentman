<script lang="ts">
	import type { PageData } from './$types';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { toasts } from '$lib/stores/toasts';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import ItemCardSkeleton from '$lib/components/ItemCardSkeleton.svelte';
	import ContentValueDisplay from '$lib/components/content/ContentValueDisplay.svelte';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { getCardFields } from '$lib/features/forms/helpers';
	import { formatContentValue, getContentItemId } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { RootConfig } from '$lib/config/root-config';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { fetchContentDocument } from '$lib/content/service';

	let { data }: { data: PageData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let content = $state(data.content);
	let contentError = $state(data.contentError);
	let packageBlocks = $state<SerializablePackageBlock[]>(data.packageBlocks ?? []);
	let blockRegistryError = $state<string | null>(data.blockRegistryError ?? null);
	let localBlockRegistry = $state<BlockRegistry | null>(null);
	let rootConfig = $state<RootConfig | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);
	const path = $derived(discoveredConfig?.path ?? null);
	const isSingletonContent = $derived(!config?.collection);
	const contentKind = $derived.by(() => {
		if (!config) {
			return null;
		}

		if (!config.collection) {
			return 'single entry';
		}

		return config.content.mode === 'directory' ? 'directory collection' : 'file collection';
	});
	const cardFields = $derived(config ? getCardFields(config) : { primary: [], secondary: [] });
	const blockRegistry = $derived.by(() => {
		if (blockRegistryError) {
			return null;
		}

		return isLocalMode ? localBlockRegistry : createBlockRegistry(blockConfigs, { packageBlocks });
	});
	const flashMessageKeys = [
		'saved',
		'published',
		'merged',
		'cancelled',
		'deleted',
		'branch'
	] as const;
	let localLoadRequest = 0;

	function applyRemoteData() {
		discoveredConfig = data.discoveredConfig;
		blockConfigs = data.blockConfigs ?? [];
		content = data.content;
		contentError = data.contentError;
		packageBlocks = data.packageBlocks ?? [];
		blockRegistryError = data.blockRegistryError ?? null;
		localBlockRegistry = null;
		rootConfig = null;
	}

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

		const branch = urlParams.get('branch');

		if (branch && data.repo && !isLocalMode && 'owner' in data.repo) {
			const repoFullName = `${data.repo.owner}/${data.repo.name}`;
			draftBranchStore.setBranch(branch, repoFullName);
		}

		if (urlParams.get('saved') === 'true') {
			toasts.add(
				isLocalMode ? 'Changes saved to local files.' : 'Changes saved to draft!',
				'success'
			);
		}

		if (urlParams.get('published') === 'true') {
			toasts.add(
				isLocalMode ? 'Changes saved to local files.' : 'Changes published successfully!',
				'success'
			);
		}

		if (urlParams.get('merged') === 'true') {
			toasts.add('Changes published successfully!', 'success');
		}

		if (urlParams.get('cancelled') === 'true') {
			toasts.add('Draft discarded successfully.', 'info');
		}

		if (urlParams.get('deleted') === 'true') {
			toasts.add('Item deleted successfully!', 'success');
		}

		if (flashKey) {
			sessionStorage.setItem(flashKey, 'seen');
		}
	}

	onMount(async () => {
		handleUrlMessages();
	});

	async function loadLocalPage(pageSlug: string) {
		const requestId = ++localLoadRequest;

		content = null;
		contentError = null;
		await localContent.refresh();

		const repoState = get(localRepo);
		const contentState = get(localContent);

		if (requestId !== localLoadRequest) {
			return;
		}

		if (!repoState.backend) {
			contentError = 'No local repository is open.';
			return;
		}

		rootConfig = contentState.rootConfig;
		blockConfigs = contentState.blockConfigs;
		packageBlocks = [];
		blockRegistryError = contentState.blockRegistryError;
		localBlockRegistry = contentState.blockRegistry;
		discoveredConfig = contentState.configs.find((entry) => entry.slug === pageSlug) ?? null;

		if (!discoveredConfig) {
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

			content = loadedContent;
		} catch (error) {
			if (requestId !== localLoadRequest) {
				return;
			}

			contentError = error instanceof Error ? error.message : 'Failed to load content';
		}
	}

	$effect(() => {
		if (isLocalMode) {
			void loadLocalPage(data.pageSlug);
			return;
		}

		localLoadRequest += 1;
		applyRemoteData();
	});

	function hasDraftChanges(itemId: string | undefined): 'modified' | 'created' | 'deleted' | null {
		if (!itemId || !data.draftChanges) return null;

		if (data.draftChanges.modified.some((change) => change.itemId === itemId)) return 'modified';
		if (data.draftChanges.created.some((change) => change.itemId === itemId)) return 'created';
		if (data.draftChanges.deleted.some((change) => change.itemId === itemId)) return 'deleted';

		return null;
	}

	function getDraftItems() {
		if (!data.draftChanges || !Array.isArray(content)) return [];

		return [
			...data.draftChanges.modified
				.filter((change) => change.draftContent)
				.map((change) => ({
					item: change.draftContent as ContentRecord,
					badge: 'draft' as const,
					itemId: change.itemId
				})),
			...data.draftChanges.created
				.filter((change) => change.draftContent)
				.map((change) => ({
					item: change.draftContent as ContentRecord,
					badge: 'new' as const,
					itemId: change.itemId
				})),
			...data.draftChanges.deleted
				.filter((change) => change.mainContent)
				.map((change) => ({
					item: change.mainContent as ContentRecord,
					badge: 'deleted' as const,
					itemId: change.itemId
				}))
		];
	}

	function getRegularItems() {
		if (!Array.isArray(content) || !config) return [];

		return content.filter((item) => {
			const itemId = getContentItemId(config, item as ContentRecord);
			return !hasDraftChanges(itemId);
		});
	}

	const hasDrafts = $derived(
		!isLocalMode &&
			data.draftChanges &&
			(data.draftChanges.modified.length > 0 ||
				data.draftChanges.created.length > 0 ||
				data.draftChanges.deleted.length > 0)
	);
</script>

{#if !discoveredConfig || !config || !contentKind || !path || !blockRegistry}
	<div class="container mx-auto p-4 sm:p-6">
		<div class="mb-4 sm:mb-6">
			<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to all content</a>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
			{blockRegistryError || contentError || 'Loading content...'}
		</div>
	</div>
{:else}
	<div class="container mx-auto p-4 sm:p-6">
		<div class="mb-4 sm:mb-6">
			<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to all content</a>
		</div>

		<div class="mb-4 sm:mb-6">
			<h1 class="text-2xl font-bold sm:text-3xl">{config.label}</h1>
			<div class="mt-2 flex flex-wrap gap-2 text-sm text-gray-600 sm:gap-3">
				<span class="capitalize">Type: {contentKind}</span>
				<span class="hidden sm:inline">•</span>
				<span class="font-mono text-xs break-all">{path}</span>
				{#if isLocalMode && rootConfig?.local?.previewUrl}
					<span class="hidden sm:inline">•</span>
					<a
						href={rootConfig.local.previewUrl}
						target="_blank"
						rel="noreferrer"
						class="text-blue-600 hover:underline"
					>
						Open Local Preview
					</a>
				{/if}
			</div>
		</div>

		{#if !isLocalMode && data.draftBranch && data.draftChanges}
			{@const hasChanges =
				data.draftChanges.modified.length > 0 ||
				data.draftChanges.created.length > 0 ||
				data.draftChanges.deleted.length > 0}
			{#if hasChanges}
				<div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
					<p class="text-sm font-medium text-blue-800">Draft Changes</p>
					<p class="mt-1 text-sm text-blue-700">
						You have unpublished changes on
						<code class="rounded bg-blue-100 px-1 text-xs">{data.draftBranch}</code>
					</p>
				</div>
			{/if}
		{/if}

		{#if contentError}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6">
				<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
				<p class="text-sm text-red-700">{contentError}</p>
			</div>
		{:else if content === null}
			<div class="space-y-4">
				{#each Array(6) as _}
					<ItemCardSkeleton />
				{/each}
			</div>
		{:else if isSingletonContent}
			<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
				<div class="border-b border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
					<h2 class="font-semibold text-gray-900">Content</h2>
				</div>
				<div class="p-4 sm:p-6">
					<dl class="space-y-6">
						{#each config.blocks as block}
							<div class="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
								<dt class="mb-2 text-sm font-semibold text-gray-700">
									{block.label ?? block.id}
								</dt>
								<dd class="text-gray-900">
									<ContentValueDisplay
										{block}
										value={(content as ContentRecord)[block.id]}
										{blockRegistry}
									/>
								</dd>
							</div>
						{/each}
					</dl>
				</div>
				<div class="flex gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
					<a
						href="/pages/{discoveredConfig.slug}/edit"
						class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
					>
						Edit Content
					</a>
				</div>
			</div>
		{:else}
			{@const draftItems = getDraftItems()}
			{@const regularItems = getRegularItems()}
			{@const totalItems = Array.isArray(content) ? content.length : 0}

			{#if totalItems > 0 || hasDrafts}
				<div class="mb-4 flex items-center justify-between">
					<p class="text-sm text-gray-600">{totalItems} {totalItems === 1 ? 'item' : 'items'}</p>
					<a
						href="/pages/{discoveredConfig.slug}/new"
						class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
					>
						New {config.label.replace(/s$/, '')}
					</a>
				</div>

				{#if !isLocalMode && hasDrafts}
					<div class="mb-6">
						<h2 class="mb-3 text-lg font-semibold text-gray-900">Draft Changes</h2>
						<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each draftItems as { item, badge }}
								{@const itemId = getContentItemId(config, item)}
								<ItemCard
									{item}
									{cardFields}
									{badge}
									href={`/pages/${discoveredConfig.slug}/${itemId}/edit`}
								/>
							{/each}
						</div>
					</div>
				{/if}

				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each regularItems as item}
						{@const itemId = getContentItemId(config, item as ContentRecord)}
						<ItemCard {item} {cardFields} href={`/pages/${discoveredConfig.slug}/${itemId}/edit`} />
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
					<h3 class="mb-2 text-lg font-semibold text-gray-900">No items yet</h3>
					<p class="mb-4 text-sm text-gray-600">
						Create the first {config.label.replace(/s$/, '')} to get started.
					</p>
					<a
						href="/pages/{discoveredConfig.slug}/new"
						class="inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
					>
						New {config.label.replace(/s$/, '')}
					</a>
				</div>
			{/if}
		{/if}
	</div>
{/if}
