<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
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
	import {
		getConfigItemLabel,
		getOrderedCollectionRecords
	} from '$lib/features/content-management/navigation';
	import { getContentItemId } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { DraftChange, DraftComparison } from '$lib/utils/draft-comparison';
	import { buildLoginRedirect } from '$lib/utils/routing';
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
	let draftBranch = $state<string | null>(null);
	let draftChanges = $state<DraftComparison | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);
	const navigationManifest = $derived(
		isLocalMode ? $localContent.navigationManifest.manifest : data.navigationManifest.manifest
	);
	const isSingletonContent = $derived(!config?.collection);
	const activeBranch = $derived(data.branch ?? null);
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
	const loadingSkeletons = [0, 1, 2, 3, 4, 5];
	let localLoadRequest = 0;
	let draftStatusRequest = 0;

	function applyRemoteData() {
		discoveredConfig = data.discoveredConfig;
		blockConfigs = data.blockConfigs ?? [];
		content = data.content;
		contentError = data.contentError;
		packageBlocks = data.packageBlocks ?? [];
		blockRegistryError = data.blockRegistryError ?? null;
		localBlockRegistry = null;
	}

	function resetDraftStatus() {
		draftBranch = null;
		draftChanges = null;
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

		if (branch && data.selectedRepo && !isLocalMode) {
			const repoFullName = `${data.selectedRepo.owner}/${data.selectedRepo.name}`;
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

	async function loadRemoteDraftStatus(pageSlug: string) {
		const requestId = ++draftStatusRequest;
		resetDraftStatus();

		try {
			const response = await fetch(`/api/repo/draft-status?slug=${encodeURIComponent(pageSlug)}`);

			if (requestId !== draftStatusRequest) {
				return;
			}

			if (response.status === 401) {
				window.location.assign(buildLoginRedirect(resolve('/auth/login'), window.location));
				return;
			}

			if (!response.ok) {
				console.error(`Failed to load draft status for ${pageSlug}: ${response.status}`);
				return;
			}

			const result = (await response.json()) as {
				draftBranch: string | null;
				draftChanges: DraftComparison | null;
			};

			if (requestId !== draftStatusRequest) {
				return;
			}

			draftBranch = result.draftBranch;
			draftChanges = result.draftChanges;

			if (data.selectedRepo) {
				const repoFullName = `${data.selectedRepo.owner}/${data.selectedRepo.name}`;
				if (result.draftBranch) {
					draftBranchStore.setBranch(result.draftBranch, repoFullName);
				} else if (draftBranchStore.hasDraft(repoFullName)) {
					draftBranchStore.clear();
				}
			}
		} catch (error) {
			if (requestId !== draftStatusRequest) {
				return;
			}

			console.error(`Failed to load draft status for ${pageSlug}:`, error);
		}
	}

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
			draftStatusRequest += 1;
			resetDraftStatus();
			void loadLocalPage(data.pageSlug);
			return;
		}

		localLoadRequest += 1;
		applyRemoteData();
		void loadRemoteDraftStatus(data.pageSlug);
	});

	function hasDraftChanges(itemId: string | undefined): 'modified' | 'created' | 'deleted' | null {
		if (!itemId || !draftChanges) return null;

		if (draftChanges.modified.some((change: DraftChange) => change.itemId === itemId))
			return 'modified';
		if (draftChanges.created.some((change: DraftChange) => change.itemId === itemId))
			return 'created';
		if (draftChanges.deleted.some((change: DraftChange) => change.itemId === itemId))
			return 'deleted';

		return null;
	}

	function getDraftItems() {
		if (!draftChanges || !Array.isArray(content)) return [];

		return [
			...draftChanges.modified
				.filter((change: DraftChange) => change.draftContent)
				.map((change: DraftChange) => ({
					item: change.draftContent as ContentRecord,
					badge: 'draft' as const,
					itemId: change.itemId
				})),
			...draftChanges.created
				.filter((change: DraftChange) => change.draftContent)
				.map((change: DraftChange) => ({
					item: change.draftContent as ContentRecord,
					badge: 'new' as const,
					itemId: change.itemId
				})),
			...draftChanges.deleted
				.filter((change: DraftChange) => change.mainContent)
				.map((change: DraftChange) => ({
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

	function getOrderedRegularItems() {
		if (!Array.isArray(content) || !config) {
			return {
				items: [],
				groups: []
			};
		}

		return getOrderedCollectionRecords(config, getRegularItems(), navigationManifest);
	}

	function getItemHref(itemId: string | undefined, branch?: string | null) {
		if (!itemId) {
			return resolve(`/pages/${discoveredConfig.slug}`);
		}

		const path = resolve(`/pages/${discoveredConfig.slug}/${itemId}/edit`);
		return branch ? `${path}?branch=${encodeURIComponent(branch)}` : path;
	}

	function getEditHref() {
		const path = resolve(`/pages/${discoveredConfig.slug}/edit`);
		const branch = !isLocalMode && isSingletonContent ? activeBranch : undefined;
		return branch ? `${path}?branch=${encodeURIComponent(branch)}` : path;
	}

	function getNewHref() {
		const path = resolve(`/pages/${discoveredConfig.slug}/new`);
		const branch = !isLocalMode ? activeBranch : undefined;
		return branch ? `${path}?branch=${encodeURIComponent(branch)}` : path;
	}

	const hasDrafts = $derived(
		!isLocalMode &&
			draftChanges &&
			(draftChanges.modified.length > 0 ||
				draftChanges.created.length > 0 ||
				draftChanges.deleted.length > 0)
	);
</script>

{#if !discoveredConfig || !config || !blockRegistry}
	<div class="mx-auto max-w-6xl">
		<div class="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-600">
			{blockRegistryError || contentError || 'Loading content...'}
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-6xl">
		<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">
				{config.label}
			</h1>

			{#if !isSingletonContent}
				<a
					href={getNewHref()}
					class="inline-flex items-center justify-center rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
				>
					New {getConfigItemLabel(config)}
				</a>
			{/if}
		</div>

		{#if !isLocalMode && draftBranch && draftChanges}
			{@const hasChanges =
				draftChanges.modified.length > 0 ||
				draftChanges.created.length > 0 ||
				draftChanges.deleted.length > 0}
			{#if hasChanges}
				<div class="mb-5 rounded-md border border-stone-200 bg-stone-100 p-3">
					<p class="text-sm font-medium text-stone-900">Draft changes</p>
					<p class="mt-1 text-sm text-stone-600">
						You have unpublished changes on
						<code class="rounded bg-white px-1 text-xs">{draftBranch}</code>
					</p>
				</div>
			{/if}
		{/if}

		{#if contentError}
			<div class="rounded-md border border-red-200 bg-red-50 p-4">
				<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
				<p class="text-sm text-red-700">{contentError}</p>
			</div>
		{:else if content === null}
			<div class="space-y-3">
				{#each loadingSkeletons as skeleton (skeleton)}
					<ItemCardSkeleton />
				{/each}
			</div>
		{:else if isSingletonContent}
			<div class="rounded-md border border-stone-200 bg-white">
				<div class="p-4">
					<dl class="space-y-4">
						{#each config.blocks as block (block.id)}
							<div class="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
								<dt class="mb-2 text-sm font-semibold text-stone-700">
									{block.label ?? block.id}
								</dt>
								<dd class="text-stone-950">
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
				<div class="flex gap-3 border-t border-stone-200 bg-stone-50 px-4 py-3">
					<a
						href={getEditHref()}
						class="inline-flex items-center justify-center rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
					>
						Edit
					</a>
				</div>
			</div>
		{:else}
			{@const draftItems = getDraftItems()}
			{@const regularItems = getOrderedRegularItems()}
			{@const totalItems = Array.isArray(content) ? content.length : 0}

			{#if totalItems > 0 || hasDrafts}
				<div class="mb-3 flex items-center justify-between">
					<p class="text-sm text-stone-600">{totalItems} {totalItems === 1 ? 'item' : 'items'}</p>
				</div>

				{#if !isLocalMode && hasDrafts}
					<div class="mb-5">
						<p class="mb-3 text-sm font-semibold tracking-[0.16em] text-stone-500 uppercase">
							Draft changes
						</p>
						<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
							{#each draftItems as { item, badge, itemId } (itemId)}
								<ItemCard {item} {cardFields} {badge} href={getItemHref(itemId, activeBranch)} />
							{/each}
						</div>
					</div>
				{/if}

				<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{#each regularItems.groups as group (group.id)}
						{#if group.items.length > 0}
							<div class="md:col-span-2 lg:col-span-3">
								<h3 class="mb-3 text-sm font-semibold tracking-[0.16em] text-stone-500 uppercase">
									{group.label}
								</h3>
								<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
									{#each group.items as entry (entry.itemId)}
										<ItemCard
											item={entry.item}
											{cardFields}
											href={getItemHref(entry.itemId, activeBranch)}
										/>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
					{#each regularItems.items as entry (entry.itemId)}
						<ItemCard
							item={entry.item}
							{cardFields}
							href={getItemHref(entry.itemId, activeBranch)}
						/>
					{/each}
				</div>
			{:else}
				<div class="rounded-md border border-dashed border-stone-300 bg-white p-8 text-center">
					<h3 class="mb-2 text-lg font-semibold text-stone-950">No items yet</h3>
					<p class="mb-4 text-sm text-stone-600">
						Create the first {getConfigItemLabel(config).toLowerCase()} to get started.
					</p>
					<a
						href={resolve(`/pages/${discoveredConfig.slug}/new`)}
						class="inline-flex rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
					>
						New {getConfigItemLabel(config)}
					</a>
				</div>
			{/if}
		{/if}
	</div>
{/if}
