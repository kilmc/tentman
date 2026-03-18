<script lang="ts">
	import type { PageData } from './$types';
	import { toasts } from '$lib/stores/toasts';
	import { getFieldLabel, type FieldDefinition } from '$lib/types/config';
	import { onMount } from 'svelte';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import ItemCardSkeleton from '$lib/components/ItemCardSkeleton.svelte';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { getCardFields, normalizeFields } from '$lib/features/forms/helpers';
	import { formatContentValue, getContentItemId } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';

	let { data }: { data: PageData } = $props();

	const { discoveredConfig, content, contentError, repo, draftBranch, draftChanges } = data;
	const { config, type, path } = discoveredConfig;
	const normalizedFields = normalizeFields(config.fields);

	// Handle URL query parameters for merge/cancel/delete/save success messages
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);

		// Handle draft branch from save redirect
		const branch = urlParams.get('branch');
		if (branch && repo) {
			const repoFullName = `${repo.owner}/${repo.name}`;
			draftBranchStore.setBranch(branch, repoFullName);
		}

		if (urlParams.get('saved') === 'true') {
			toasts.add('Changes saved to draft!', 'success');
			// Clean up URL without reload
			const url = new URL(window.location.href);
			url.searchParams.delete('saved');
			url.searchParams.delete('branch');
			window.history.replaceState({}, '', url.toString());
		}

		if (urlParams.get('merged') === 'true') {
			toasts.add('Changes published successfully!', 'success');
			// Clean up URL without reload
			const url = new URL(window.location.href);
			url.searchParams.delete('merged');
			window.history.replaceState({}, '', url.toString());
		}

		if (urlParams.get('cancelled') === 'true') {
			toasts.add('Draft discarded successfully.', 'info');
			// Clean up URL without reload
			const url = new URL(window.location.href);
			url.searchParams.delete('cancelled');
			window.history.replaceState({}, '', url.toString());
		}

		if (urlParams.get('deleted') === 'true') {
			toasts.add('Item deleted successfully!', 'success');
			// Clean up URL without reload
			const url = new URL(window.location.href);
			url.searchParams.delete('deleted');
			window.history.replaceState({}, '', url.toString());
		}
	});

	const cardFields = getCardFields(config);

	function getFieldType(fieldDef: FieldDefinition): string | undefined {
		return typeof fieldDef === 'object' ? fieldDef.type : undefined;
	}

	function getArrayItems(record: ContentRecord, fieldName: string): any[] {
		const value = record[fieldName];
		return Array.isArray(value) ? value : [];
	}

	// Helper to check if an item has draft changes
	function hasDraftChanges(itemId: string | undefined): 'modified' | 'created' | 'deleted' | null {
		if (!itemId || !draftChanges) return null;

		if (draftChanges.modified.some((change) => change.itemId === itemId)) return 'modified';
		if (draftChanges.created.some((change) => change.itemId === itemId)) return 'created';
		if (draftChanges.deleted.some((change) => change.itemId === itemId)) return 'deleted';

		return null;
	}

	// Get items with draft changes for the draft section
	function getDraftItems() {
		if (!draftChanges || !Array.isArray(content)) return [];

		const items = [];

		// Add modified items (show draft content)
		for (const change of draftChanges.modified) {
			if (change.draftContent) {
				items.push({
					item: change.draftContent as ContentRecord,
					badge: 'draft' as const,
					itemId: change.itemId
				});
			}
		}

		// Add created items (new items only in draft)
		for (const change of draftChanges.created) {
			if (change.draftContent) {
				items.push({
					item: change.draftContent as ContentRecord,
					badge: 'new' as const,
					itemId: change.itemId
				});
			}
		}

		// Add deleted items (items removed in draft)
		for (const change of draftChanges.deleted) {
			if (change.mainContent) {
				items.push({
					item: change.mainContent as ContentRecord,
					badge: 'deleted' as const,
					itemId: change.itemId
				});
			}
		}

		return items;
	}

	// Get items without draft changes for the main section
	function getRegularItems() {
		if (!Array.isArray(content)) return [];

		return content.filter((item) => {
			const itemId = getContentItemId(type, config, item as ContentRecord);
			const changeType = hasDraftChanges(itemId);
			// Only show items that don't have draft changes
			return !changeType;
		});
	}

	const hasDrafts = draftChanges && (
		draftChanges.modified.length > 0 ||
		draftChanges.created.length > 0 ||
		draftChanges.deleted.length > 0
	);
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to all content</a>
	</div>

	<div class="mb-4 sm:mb-6">
		<h1 class="text-2xl sm:text-3xl font-bold">{config.label}</h1>
		<div class="mt-2 flex flex-wrap gap-2 sm:gap-3 text-sm text-gray-600">
			<span class="capitalize">Type: {type}</span>
			<span class="hidden sm:inline">•</span>
			<span class="font-mono text-xs break-all">{path}</span>
		</div>
	</div>

	<!-- Draft Changes Banner -->
	{#if draftBranch && draftChanges}
		{@const hasChanges = draftChanges.modified.length > 0 || draftChanges.created.length > 0 || draftChanges.deleted.length > 0}
		{#if hasChanges}
			<div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<p class="text-sm font-medium text-blue-800">📝 Draft Changes</p>
						<p class="mt-1 text-sm text-blue-700">
							You have unpublished changes on <code class="text-xs bg-blue-100 px-1 rounded">{draftBranch}</code>
						</p>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	{#if contentError}
		<!-- Error state -->
		<div class="rounded-lg border border-red-200 bg-red-50 p-6">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if content === null}
		<!-- Loading state with skeleton cards -->
		<div class="space-y-4">
			{#each Array(6) as _}
				<ItemCardSkeleton />
			{/each}
		</div>
	{:else if type === 'singleton'}
		<!-- Singleton view: Display single object -->
		<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 bg-gray-50 px-4 sm:px-6 py-4">
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
									<div class="prose max-w-none">
										{content[fieldName] || '—'}
									</div>
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
											{#each getArrayItems(content as ContentRecord, fieldName) as item, i}
												<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
													{#if typeof item === 'object' && item !== null}
														<!-- Display object as key-value pairs -->
														<dl class="space-y-2">
															{#each Object.entries(item) as [key, value]}
																{#if value !== '' && value !== null && value !== undefined}
																	<div class="flex flex-col sm:flex-row sm:gap-2">
																		<dt class="text-xs font-medium text-gray-600 capitalize min-w-24">
																			{key}:
																		</dt>
																		<dd class="text-sm text-gray-900 break-words">
																			{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
																		</dd>
																	</div>
																{/if}
															{/each}
														</dl>
													{:else}
														<!-- Display primitive values -->
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
			<div class="border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-4 flex gap-3">
				<a
					href="/pages/{discoveredConfig.slug}/edit"
					class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
				>
					Edit Content
				</a>
			</div>
		</div>
	{:else if type === 'array' || type === 'collection'}
		<!-- Array/Collection view: Display list of items -->
		{@const draftItems = getDraftItems()}
		{@const regularItems = getRegularItems()}
		{@const totalItems = Array.isArray(content) ? content.length : 0}

		{#if totalItems > 0 || hasDrafts}
			<div class="mb-4 flex items-center justify-between">
				<p class="text-sm text-gray-600">{totalItems} {totalItems === 1 ? 'item' : 'items'}</p>
				<a
					href="/pages/{discoveredConfig.slug}/new"
					class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
				>
					New {config.label.replace(/s$/, '')}
				</a>
			</div>

			<!-- Draft Changes Section -->
			{#if hasDrafts && draftItems.length > 0}
				<div class="mb-8">
					<div class="mb-4 flex items-center gap-2">
						<h2 class="text-xl font-semibold text-gray-900">Draft Changes</h2>
						<span class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
							{draftItems.length}
						</span>
					</div>
					<div class="space-y-4">
						{#each draftItems as { item, badge, itemId }}
							<ItemCard
								{item}
								href="/pages/{discoveredConfig.slug}/{itemId}/edit"
								{cardFields}
								{badge}
							/>
						{/each}
					</div>
				</div>
			{/if}

			<!-- All Items Section -->
			{#if regularItems.length > 0}
				<div>
					{#if hasDrafts}
						<div class="mb-4 flex items-center gap-2">
							<h2 class="text-xl font-semibold text-gray-900">All Items</h2>
							<span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
								{regularItems.length}
							</span>
						</div>
					{/if}
					<div class="space-y-4">
						{#each regularItems as item, i}
							<ItemCard
								{item}
								href="/pages/{discoveredConfig.slug}/{getContentItemId(type, config, item as ContentRecord) || i}/edit"
								{cardFields}
							/>
						{/each}
					</div>
				</div>
			{/if}
		{:else}
			<!-- Empty state -->
			<div class="rounded-lg border border-gray-200 bg-white shadow-sm p-12 text-center">
				<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
					<svg class="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-gray-900">No {config.label.toLowerCase()} yet</h3>
				<p class="mb-6 text-sm text-gray-600">
					Get started by creating your first {config.label.replace(/s$/, '').toLowerCase()}.
				</p>
				<a
					href="/pages/{discoveredConfig.slug}/new"
					class="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors shadow-sm"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Create your first {config.label.replace(/s$/, '').toLowerCase()}
				</a>
			</div>
		{/if}
	{/if}

	<!-- Debug info (can be removed later) -->
	<details class="mt-8">
		<summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
			Debug: View raw data
		</summary>
		<pre class="mt-2 overflow-auto rounded border border-gray-200 bg-gray-50 p-4 text-xs">{JSON.stringify(
				{ config, type, content, draftChanges },
				null,
				2
			)}</pre>
	</details>
</div>
