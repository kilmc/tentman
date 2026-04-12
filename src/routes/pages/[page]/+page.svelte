<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { toasts } from '$lib/stores/toasts';
	import ContentValueDisplay from '$lib/components/content/ContentValueDisplay.svelte';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import {
		getConfigItemLabel,
		getFirstCollectionItemId
	} from '$lib/features/content-management/navigation';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { DraftComparison } from '$lib/utils/draft-comparison';
	import { buildPathWithQuery, buildReposRedirect } from '$lib/utils/routing';
	import { traceRouting } from '$lib/utils/routing-trace';
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
	const isCollectionContent = $derived(!!config?.collection);
	const activeBranch = $derived(data.branch ?? null);
	const collectionItemLabel = $derived(config ? getConfigItemLabel(config) : 'item');
	const blockRegistry = $derived.by(() => {
		if (blockRegistryError) {
			return null;
		}

		return isLocalMode ? localBlockRegistry : createBlockRegistry(blockConfigs, { packageBlocks });
	});
	const branchQueryValue = $derived(activeBranch ?? undefined);
	const collectionItemCount = $derived(Array.isArray(content) ? content.length : 0);
	const firstCollectionItemHref = $derived.by(() => {
		if (!config?.collection || !content || contentError) {
			return null;
		}

		const firstItemId = getFirstCollectionItemId(config, content, navigationManifest);

		if (!firstItemId) {
			return null;
		}

		return buildPathWithQuery(resolve(`/pages/${data.pageSlug}/${firstItemId}/edit`), {
			branch: branchQueryValue
		});
	});
	const newCollectionItemHref = $derived.by(() => {
		if (!config?.collection) {
			return null;
		}

		return buildPathWithQuery(resolve(`/pages/${data.pageSlug}/new`), {
			branch: branchQueryValue
		});
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
				const redirectTarget = buildReposRedirect(resolve('/repos'), window.location);
				traceRouting('navigation:assign', {
					to: redirectTarget,
					source: 'page-view.draft-status-401'
				});
				window.location.assign(redirectTarget);
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

	function getEditHref() {
		const path = resolve(`/pages/${discoveredConfig.slug}/edit`);
		const branch = !isLocalMode && isSingletonContent ? activeBranch : undefined;
		return branch ? `${path}?branch=${encodeURIComponent(branch)}` : path;
	}
</script>

{#if !discoveredConfig || !config || (!config.collection && !blockRegistry)}
	<div>
		<div class="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-600">
			{blockRegistryError || contentError || 'Loading content...'}
		</div>
	</div>
{:else}
	<div>
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
			<div class="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-600">
				Loading content...
			</div>
		{:else if isCollectionContent}
			<div class="grid gap-4 py-2">
				<p class="max-w-2xl text-sm leading-6 text-stone-600">
					{#if collectionItemCount > 0}
						Choose a {collectionItemLabel ?? 'collection item'} from the index to start editing, or create
						a new one when you need it.
					{:else}
						This collection does not have any items yet. Create the first
						{collectionItemLabel ?? 'item'} to get started.
					{/if}
				</p>

				<div class="flex flex-wrap gap-3">
					{#if firstCollectionItemHref}
						<a href={firstCollectionItemHref} class="tm-btn tm-btn-secondary"> Open first item </a>
					{/if}

					{#if newCollectionItemHref}
						<a href={newCollectionItemHref} class="tm-btn tm-btn-secondary">
							{collectionItemCount > 0 ? 'Create new item' : 'Create first item'}
						</a>
					{/if}
				</div>
			</div>
		{:else}
			<div class="grid gap-6">
				<dl class="space-y-4">
					{#each config.blocks as block (block.id)}
						<div class="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
							<dt class="mb-2 text-sm font-semibold text-stone-700">{block.label ?? block.id}</dt>
							<dd class="text-stone-950">
								<ContentValueDisplay
									{block}
									value={(content as ContentRecord)[block.id]}
									blockRegistry={blockRegistry!}
								/>
							</dd>
						</div>
					{/each}
				</dl>

				<div class="flex gap-3">
					<a href={getEditHref()} class="tm-btn tm-btn-secondary"> Edit </a>
				</div>
			</div>
		{/if}
	</div>
{/if}
