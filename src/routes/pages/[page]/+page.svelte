<script lang="ts">
	import type { PageData } from './$types';
	import { get, writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import { toasts } from '$lib/stores/toasts';
	import { getFieldLabel, type FieldDefinition, normalizeFields } from '$lib/types/config';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import ItemCardSkeleton from '$lib/components/ItemCardSkeleton.svelte';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { getCardFields } from '$lib/features/forms/helpers';
	import { formatContentValue, getContentItemId } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { RootConfig } from '$lib/config/root-config';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { fetchContent } from '$lib/content/fetcher';

	let { data }: { data: PageData } = $props();

	const isLocalMode = data.mode === 'local';

	let discoveredConfig = $state(data.discoveredConfig);
	let content = $state(data.content);
	let contentError = $state(data.contentError);
	let rootConfig = $state<RootConfig | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);
	const type = $derived(discoveredConfig?.type ?? null);
	const path = $derived(discoveredConfig?.path ?? null);
	const normalizedFields = $derived(config ? normalizeFields(config.fields) : {});
	const cardFields = $derived(config ? getCardFields(config) : { primary: [], secondary: [] });
	const flashMessageKeys = ['saved', 'published', 'merged', 'cancelled', 'deleted', 'branch'] as const;

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
			toasts.add(isLocalMode ? 'Changes saved to local files.' : 'Changes saved to draft!', 'success');
		}

		if (urlParams.get('published') === 'true') {
			toasts.add(isLocalMode ? 'Changes saved to local files.' : 'Changes published successfully!', 'success');
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

		if (!isLocalMode) {
			return;
		}

		await localContent.refresh();

		const repoState = get(localRepo);
		const contentState = get(localContent);

		if (!repoState.backend) {
			contentError = 'No local repository is open.';
			return;
		}

		rootConfig = contentState.rootConfig;
		discoveredConfig = contentState.configs.find((entry) => entry.slug === data.pageSlug) ?? null;

		if (!discoveredConfig) {
			contentError = 'Configuration not found';
			return;
		}

		try {
			content = await fetchContent(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.type,
				discoveredConfig.path
			);
		} catch (error) {
			contentError = error instanceof Error ? error.message : 'Failed to load content';
		}
	});

	function getFieldType(fieldDef: FieldDefinition): string | undefined {
		return typeof fieldDef === 'object' ? fieldDef.type : undefined;
	}

	function getArrayItems(record: ContentRecord, fieldName: string): ContentRecord[] {
		const value = record[fieldName];
		return Array.isArray(value) ? (value as ContentRecord[]) : [];
	}

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
		if (!Array.isArray(content) || !config || !type) return [];

		return content.filter((item) => {
			const itemId = getContentItemId(type, config, item as ContentRecord);
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

{#if !discoveredConfig || !config || !type || !path}
	<div class="container mx-auto p-4 sm:p-6">
		<div class="mb-4 sm:mb-6">
			<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to all content</a>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
			{contentError || 'Loading content...'}
		</div>
	</div>
{:else}
	<div class="container mx-auto p-4 sm:p-6">
		<div class="mb-4 sm:mb-6">
			<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to all content</a>
		</div>

		<div class="mb-4 sm:mb-6">
			<h1 class="text-2xl sm:text-3xl font-bold">{config.label}</h1>
			<div class="mt-2 flex flex-wrap gap-2 text-sm text-gray-600 sm:gap-3">
				<span class="capitalize">Type: {type}</span>
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
		{:else if type === 'singleton'}
			<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
				<div class="border-b border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
					<h2 class="font-semibold text-gray-900">Content</h2>
				</div>
				<div class="p-4 sm:p-6">
					<dl class="space-y-6">
						{#each Object.entries(normalizedFields) as [fieldName, fieldDef]}
							<div class="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
								<dt class="mb-2 text-sm font-semibold text-gray-700">
									{getFieldLabel(fieldName, fieldDef)}
								</dt>
								<dd class="text-gray-900">
									{#if fieldName === '_body'}
										<div class="prose max-w-none">{content[fieldName] || '—'}</div>
									{:else if getFieldType(fieldDef) === 'markdown'}
										<div class="prose max-w-none whitespace-pre-wrap font-mono text-sm">
											{formatContentValue((content as ContentRecord)[fieldName])}
										</div>
									{:else if getFieldType(fieldDef) === 'array' && Array.isArray((content as ContentRecord)[fieldName])}
										<div class="mt-2 space-y-3">
											{#if getArrayItems(content as ContentRecord, fieldName).length === 0}
												<div class="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
													<p class="text-sm text-gray-500">No items in this list</p>
												</div>
											{:else}
												{#each getArrayItems(content as ContentRecord, fieldName) as item}
													<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
														{#if typeof item === 'object' && item !== null}
															<dl class="space-y-2">
																{#each Object.entries(item) as [key, value]}
																	{#if value !== '' && value !== null && value !== undefined}
																		<div class="flex flex-col gap-2 sm:flex-row sm:gap-2">
																			<dt class="min-w-24 text-xs font-medium capitalize text-gray-600">
																				{key}:
																			</dt>
																			<dd class="break-words text-sm text-gray-900">
																				{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
																			</dd>
																		</div>
																	{/if}
																{/each}
															</dl>
														{:else}
															<span class="text-sm text-gray-900">{item}</span>
														{/if}
													</div>
												{/each}
											{/if}
										</div>
									{:else}
										<span class="text-sm">{formatContentValue((content as ContentRecord)[fieldName])}</span>
									{/if}
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
								{@const itemId = getContentItemId(type, config, item)}
								<ItemCard
									{item}
									{cardFields}
									badge={badge}
									href={`/pages/${discoveredConfig.slug}/${itemId}/edit`}
								/>
							{/each}
						</div>
					</div>
				{/if}

				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each regularItems as item}
						{@const itemId = getContentItemId(type, config, item as ContentRecord)}
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
