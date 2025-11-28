<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import KeyboardShortcutHelp from '$lib/components/KeyboardShortcutHelp.svelte';
	import { enhance } from '$app/forms';
	import { toasts } from '$lib/stores/toasts';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { getFieldLabel } from '$lib/types/config';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { discoveredConfig, content, contentError, repo } = data;
	const { config, type, path } = discoveredConfig;

	// Edit mode state
	let editMode = $state(false);
	let createMode = $state(false);
	let editingItem = $state<any>(null);
	let editingIndex = $state<number | null>(null);

	// Delete confirmation state
	let deleteConfirmItem = $state<any>(null);
	let deleteConfirmIndex = $state<number | null>(null);

	// Feedback state
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);

	// Track if form has unsaved changes
	let hasUnsavedChanges = $state(false);
	let originalData = $state<any>(null);

	// Form submission reference
	let currentForm: HTMLFormElement | null = null;

	// Handle form action results
	$effect(() => {
		if (form?.success) {
			saveSuccess = true;
			saveError = null;
			saving = false;
			hasUnsavedChanges = false;
			originalData = null;

			// Show success toast
			if (form.created) {
				toasts.add('Item created successfully!', 'success');
			} else if (form.deleted) {
				toasts.add('Item deleted successfully!', 'success');
			} else {
				toasts.add('Changes saved successfully!', 'success');
			}

			editMode = false;
			createMode = false;
			editingItem = null;
			editingIndex = null;
			deleteConfirmItem = null;
			deleteConfirmIndex = null;

			// Reload the page to show updated content
			if (form.created || form.deleted) {
				window.location.reload();
			}
		} else if (form?.error) {
			saveError = form.error;
			saveSuccess = false;
			saving = false;
			toasts.add(form.error, 'error');
		}
	});

	// Helper to format field values for display
	function formatFieldValue(value: any): string {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (Array.isArray(value)) return `[${value.length} items]`;

		// Handle dates (both Date objects and ISO strings)
		if (value instanceof Date) {
			return value.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}

		// Try to parse ISO date strings
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
			try {
				const date = new Date(value);
				if (!isNaN(date.getTime())) {
					return date.toLocaleDateString('en-US', {
						year: 'numeric',
						month: 'long',
						day: 'numeric'
					});
				}
			} catch {
				// Fall through to string display
			}
		}

		if (typeof value === 'object') return '[Object]';
		return String(value);
	}


	// Track changes to form data
	$effect(() => {
		if (editMode && editingItem && originalData) {
			hasUnsavedChanges = JSON.stringify(editingItem) !== JSON.stringify(originalData);
		}
	});

	// Warn before leaving page with unsaved changes
	beforeNavigate(({ cancel }) => {
		if (hasUnsavedChanges && !saving) {
			if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
				cancel();
			}
		}
	});

	// Keyboard shortcuts
	onMount(() => {
		const cleanup = registerKeyboardShortcuts([
			{
				key: 's',
				meta: true, // Cmd on Mac
				ctrl: true, // Ctrl on Windows/Linux (one will match depending on platform)
				callback: () => {
					if (editMode && currentForm) {
						currentForm.requestSubmit();
					}
				}
			},
			{
				key: 'Escape',
				callback: () => {
					if (deleteConfirmItem) {
						cancelDelete();
					} else if (editMode) {
						handleCancelEdit();
					}
				}
			}
		]);

		return cleanup;
	});

	// Edit handlers
	function startEditSingleton() {
		editingItem = structuredClone(content);
		originalData = structuredClone(content);
		editMode = true;
		hasUnsavedChanges = false;
	}

	function startEditItem(item: any, index: number) {
		editingItem = structuredClone(item);
		originalData = structuredClone(item);
		editingIndex = index;
		editMode = true;
		hasUnsavedChanges = false;
	}

	function handleCancelEdit() {
		if (hasUnsavedChanges) {
			if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
				return;
			}
		}
		cancelEdit();
	}

	function cancelEdit() {
		editMode = false;
		createMode = false;
		editingItem = null;
		editingIndex = null;
		originalData = null;
		hasUnsavedChanges = false;
		saveError = null;
	}

	function startCreateItem() {
		// Initialize empty item based on field types
		const newItem: Record<string, any> = {};
		for (const [fieldName, fieldDef] of Object.entries(config.fields)) {
			const fieldType = typeof fieldDef === 'object' ? fieldDef.type : fieldDef;
			// Set defaults based on type
			if (fieldType === 'boolean') {
				newItem[fieldName] = false;
			} else if (fieldType === 'number') {
				newItem[fieldName] = 0;
			} else if (fieldType === 'array') {
				newItem[fieldName] = [];
			} else {
				newItem[fieldName] = '';
			}
		}
		editingItem = newItem;
		originalData = structuredClone(newItem);
		createMode = true;
		editMode = true;
		hasUnsavedChanges = false;
	}

	function startDeleteItem(item: any, index: number) {
		deleteConfirmItem = item;
		deleteConfirmIndex = index;
	}

	function cancelDelete() {
		deleteConfirmItem = null;
		deleteConfirmIndex = null;
	}

	function getItemId(item: any): string | undefined {
		if (!config.idField) return undefined;
		const id = item[config.idField];
		return id !== undefined ? String(id) : undefined;
	}
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

	<!-- Success/Error feedback -->
	{#if saveSuccess}
		<div class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
			<p class="text-sm font-medium text-green-800">✓ Changes saved successfully!</p>
		</div>
	{/if}

	{#if saveError}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">✗ Failed to save changes</p>
			<p class="mt-1 text-sm text-red-700">{saveError}</p>
		</div>
	{/if}

	{#if contentError}
		<!-- Error state -->
		<div class="rounded-lg border border-red-200 bg-red-50 p-6">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if content === null}
		<!-- Loading state -->
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center animate-pulse">
			<div class="flex flex-col items-center gap-4">
				<div
					class="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
				></div>
				<p class="text-gray-600">Loading content...</p>
			</div>
		</div>
	{:else if type === 'singleton'}
		<!-- Singleton view: Display single object -->
		<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
				<h2 class="font-semibold">{editMode ? 'Edit Content' : 'Content'}</h2>
			</div>
			<div class="p-6">
				{#if editMode}
					<form
						bind:this={currentForm}
						method="POST"
						action="?/save"
						use:enhance={() => {
							saving = true;
							return async ({ update }) => {
								await update();
							};
						}}
					>
						<input type="hidden" name="data" value={JSON.stringify(editingItem)} />
						<FormGenerator
							{config}
							initialData={editingItem}
							onchange={(data) => editingItem = data}
							showButtons={false}
							existingItems={Array.isArray(content) ? content : []}
							currentItemId={editingItem && config.idField ? String(editingItem[config.idField]) : undefined}
						/>
						<div class="mt-6 flex gap-3">
							<button
								type="submit"
								disabled={saving}
								class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
							>
								{saving ? 'Saving...' : 'Save Changes'}
							</button>
							<button
								type="button"
								onclick={handleCancelEdit}
								disabled={saving}
								class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Cancel
							</button>
						</div>
					</form>
				{:else}
					<dl class="space-y-4">
						{#each Object.entries(config.fields) as [fieldName, fieldDef]}
							<div class="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
								<dt class="mb-1 text-sm font-medium text-gray-700">
									{getFieldLabel(fieldName, fieldDef)}
								</dt>
								<dd class="text-gray-900">
									{#if fieldName === '_body'}
										<div class="prose max-w-none">
											{content[fieldName] || '—'}
										</div>
									{:else if typeof fieldDef === 'object' && fieldDef.type === 'markdown'}
										<div class="prose max-w-none whitespace-pre-wrap font-mono text-sm">
											{formatFieldValue(content[fieldName])}
										</div>
									{:else if typeof fieldDef === 'object' && fieldDef.type === 'array' && Array.isArray(content[fieldName])}
										<ul class="mt-1 space-y-1 text-sm">
											{#each content[fieldName] as item, i}
												<li class="rounded bg-gray-50 px-2 py-1">
													{typeof item === 'object' ? JSON.stringify(item) : item}
												</li>
											{/each}
										</ul>
									{:else}
										<span class="text-sm">{formatFieldValue(content[fieldName])}</span>
									{/if}
								</dd>
							</div>
						{/each}
					</dl>
				{/if}
			</div>
			{#if !editMode}
				<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={startEditSingleton}
						class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
					>
						Edit
					</button>
				</div>
			{/if}
		</div>
	{:else if type === 'array' || type === 'collection'}
		<!-- Array/Collection view: Display list of items -->
		{#if editMode}
			<!-- Edit/Create form for array/collection item -->
			<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<h2 class="font-semibold">
						{createMode ? 'New' : 'Edit'} {config.label.replace(/s$/, '')}
						{#if !createMode && editingIndex !== null}
							(Item {editingIndex + 1})
						{/if}
					</h2>
				</div>
				<div class="p-6">
					<form
						bind:this={currentForm}
						method="POST"
						action={createMode ? '?/create' : '?/save'}
						use:enhance={() => {
							saving = true;
							return async ({ update }) => {
								await update();
							};
						}}
					>
						<input type="hidden" name="data" value={JSON.stringify(editingItem)} />
						{#if !createMode && editingIndex !== null}
							<input type="hidden" name="itemIndex" value={editingIndex} />
						{/if}
						{#if !createMode && config.idField && editingItem}
							{@const itemId = getItemId(editingItem)}
							{#if itemId}
								<input type="hidden" name="itemId" value={itemId} />
							{/if}
						{/if}
						{#if !createMode && editingItem?._filename}
							<input type="hidden" name="filename" value={editingItem._filename} />
						{/if}
						<FormGenerator
							{config}
							initialData={editingItem}
							onchange={(data) => editingItem = data}
							showButtons={false}
							existingItems={Array.isArray(content) ? content : []}
							currentItemId={editingItem && config.idField ? String(editingItem[config.idField]) : undefined}
						/>
						<div class="mt-6 flex gap-3">
							<button
								type="submit"
								disabled={saving}
								class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
							>
								{saving ? 'Saving...' : createMode ? 'Create' : 'Save Changes'}
							</button>
							<button
								type="button"
								onclick={handleCancelEdit}
								disabled={saving}
								class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			</div>
		{:else if Array.isArray(content) && content.length > 0}
			<div class="mb-4 flex items-center justify-between">
				<p class="text-sm text-gray-600">{content.length} {content.length === 1 ? 'item' : 'items'}</p>
				<button
					type="button"
					onclick={startCreateItem}
					class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
				>
					New {config.label.replace(/s$/, '')}
				</button>
			</div>

			<div class="space-y-4">
				{#each content as item, i}
					<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 hover:border-gray-300">
						<div class="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3">
							<div class="flex-1 w-full sm:w-auto">
								{#each Object.entries(config.fields).slice(0, 3) as [fieldName, fieldDef], idx}
									{#if idx === 0}
										<h3 class="text-lg font-semibold text-gray-900 break-words">
											{formatFieldValue(item[fieldName])}
										</h3>
									{:else}
										<p class="mt-1 text-sm text-gray-600">
											<span class="font-medium">{getFieldLabel(fieldName, fieldDef)}:</span>
											{formatFieldValue(item[fieldName])}
										</p>
									{/if}
								{/each}
							</div>
							<div class="flex gap-2 w-full sm:w-auto">
								<button
									type="button"
									onclick={() => startEditItem(item, i)}
									class="flex-1 sm:flex-none rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 transition-colors"
								>
									Edit
								</button>
								<button
									type="button"
									onclick={() => startDeleteItem(item, i)}
									class="flex-1 sm:flex-none rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 transition-colors"
								>
									Delete
								</button>
							</div>
						</div>

						{#if Object.entries(config.fields).length > 3}
							<details class="mt-4">
								<summary class="cursor-pointer text-sm text-blue-600 hover:underline">
									Show all fields
								</summary>
								<dl class="mt-3 space-y-2 border-t border-gray-100 pt-3">
									{#each Object.entries(config.fields).slice(3) as [fieldName, fieldDef]}
										<div class="text-sm">
											<dt class="inline font-medium text-gray-700">
												{getFieldLabel(fieldName, fieldDef)}:
											</dt>
											<dd class="inline text-gray-900 ml-2">
												{formatFieldValue(item[fieldName])}
											</dd>
										</div>
									{/each}
								</dl>
							</details>
						{/if}

						{#if item._filename}
							<p class="mt-3 text-xs text-gray-400 font-mono">{item._filename}</p>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Empty state -->
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
				<p class="mb-4 text-gray-600">No {config.label.toLowerCase()} found</p>
				<button
					type="button"
					onclick={startCreateItem}
					class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
				>
					Create your first {config.label.replace(/s$/, '').toLowerCase()}
				</button>
			</div>
		{/if}
	{/if}

	<!-- Delete confirmation modal -->
	{#if deleteConfirmItem}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 animate-fadeIn" onclick={cancelDelete}>
			<div class="mx-4 w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl animate-scaleIn" onclick={(e) => e.stopPropagation()}>
				<h3 class="mb-4 text-lg font-semibold text-gray-900">Confirm Delete</h3>
				<p class="mb-6 text-sm text-gray-600">
					Are you sure you want to delete this item? This action cannot be undone.
				</p>

				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						saving = true;
						return async ({ update }) => {
							await update();
						};
					}}
				>
					{#if deleteConfirmIndex !== null}
						<input type="hidden" name="itemIndex" value={deleteConfirmIndex} />
					{/if}
					{#if config.idField && deleteConfirmItem}
						{@const itemId = getItemId(deleteConfirmItem)}
						{#if itemId}
							<input type="hidden" name="itemId" value={itemId} />
						{/if}
					{/if}
					{#if deleteConfirmItem._filename}
						<input type="hidden" name="filename" value={deleteConfirmItem._filename} />
					{/if}

					<div class="flex gap-3">
						<button
							type="submit"
							disabled={saving}
							class="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
						>
							{saving ? 'Deleting...' : 'Delete'}
						</button>
						<button
							type="button"
							onclick={cancelDelete}
							disabled={saving}
							class="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Debug info (can be removed later) -->
	<details class="mt-8">
		<summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
			Debug: View raw data
		</summary>
		<pre class="mt-2 overflow-auto rounded border border-gray-200 bg-gray-50 p-4 text-xs">{JSON.stringify(
				{ config, type, content },
				null,
				2
			)}</pre>
	</details>

	<!-- Keyboard shortcut help -->
	{#if editMode}
		<KeyboardShortcutHelp />
	{/if}
</div>
