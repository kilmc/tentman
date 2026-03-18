<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import KeyboardShortcutHelp from '$lib/components/KeyboardShortcutHelp.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { enhance } from '$app/forms';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { getFieldLabel } from '$lib/types/config';
	import { getCardFields } from '$lib/features/forms/helpers';
	import { formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { discoveredConfig, item, contentError, itemId } = data;
	const { config } = discoveredConfig;
	const cardFields = getCardFields(config);

	// Form state
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);

	// Track when form fields are modified
	function handleFieldsChanged() {
		hasUnsavedChanges = true;
	}

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
				ctrl: true, // Ctrl on Windows/Linux
				callback: () => {
					if (currentForm) {
						currentForm.requestSubmit();
					}
				}
			},
			{
				key: 'Escape',
				callback: () => {
					if (hasUnsavedChanges) {
						if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
							window.history.back();
						}
					} else {
						window.history.back();
					}
				}
			}
		]);

		return cleanup;
	});

	// Handle form submission - validate before submitting
	function handleSubmit(event: SubmitEvent) {
		if (!formGenerator) return;

		const { data: formData, errors } = formGenerator.validate();

		// If there are validation errors, prevent submission
		if (errors.length > 0) {
			event.preventDefault();
			return false;
		}

		// Update the hidden input with validated data
		const hiddenInput = currentForm?.querySelector('input[name="data"]');
		if (hiddenInput) {
			(hiddenInput as HTMLInputElement).value = JSON.stringify(formData);
		}

		// Let the form submit naturally
		return true;
	}

	// Get item title for display
	function getItemTitle(): string {
		if (!item) return 'Item';

		// Try to find a meaningful field for the title
		const firstField = cardFields.primary[0] ?? cardFields.secondary[0];
		if (firstField) {
			const [fieldName] = firstField;
			const value = item[fieldName];
			if (value) return String(value);
		}

		return itemId;
	}
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href="/pages/{discoveredConfig.slug}" class="text-sm text-blue-600 hover:underline"
			>&larr; Back to {config.label}</a
		>
	</div>

	<div class="mb-4 sm:mb-6">
		<h1 class="text-2xl sm:text-3xl font-bold">Edit {config.label.replace(/s$/, '')}</h1>
		<p class="mt-1 text-gray-600">{getItemTitle()}</p>
	</div>

	{#if form?.error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">✗ Failed to save changes</p>
			<p class="mt-1 text-sm text-red-700">{form.error}</p>
		</div>
	{/if}

	{#if contentError}
		<!-- Error state -->
		<div class="rounded-lg border border-red-200 bg-red-50 p-6">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if item === null}
		<!-- Loading state -->
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else}
		<!-- Edit form -->
		<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
				<h2 class="font-semibold">Edit Item</h2>
			</div>
			<div class="p-6">
				<form
					bind:this={currentForm}
					method="POST"
					action="?/saveToPreview"
					onsubmit={handleSubmit}
					use:enhance={() => {
						saving = true;
						hasUnsavedChanges = false;
						return async ({ update }) => {
							await update();
							saving = false;
						};
					}}
				>
					<input type="hidden" name="data" value="" />
					{#if item?._filename}
						<input type="hidden" name="filename" value={item._filename} />
					{/if}
					<FormGenerator
						bind:this={formGenerator}
						{config}
						initialData={item}
						existingItems={[]}
						currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
						onvalidate={handleFieldsChanged}
					/>
					<div class="mt-6 flex gap-3">
						<button
							type="submit"
							disabled={saving}
							class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
						>
							{saving ? 'Saving...' : 'Continue'}
						</button>
						<a
							href="/pages/{discoveredConfig.slug}"
							class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Cancel
						</a>
					</div>
				</form>
			</div>

			<!-- Delete section -->
			<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
				<h3 class="text-sm font-semibold text-gray-900 mb-2">Danger Zone</h3>
				<p class="text-sm text-gray-600 mb-3">
					Once you delete this item, it will be permanently removed from the repository.
				</p>
				<button
					type="button"
					onclick={() => (showDeleteConfirm = true)}
					class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
				>
					Delete {config.label.replace(/s$/, '')}
				</button>
			</div>
		</div>
	{/if}

	<!-- Delete confirmation modal -->
	{#if showDeleteConfirm}
		<div class="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
			<button
				type="button"
				class="absolute inset-0 bg-black bg-opacity-50"
				aria-label="Close delete confirmation"
				onclick={() => (showDeleteConfirm = false)}
			></button>
			<div
				class="relative mx-4 w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-2xl animate-scaleIn"
				role="dialog"
				aria-modal="true"
				aria-labelledby="delete-dialog-title"
			>
				<h3 id="delete-dialog-title" class="mb-4 text-lg font-semibold text-gray-900">Confirm Delete</h3>

				<!-- Item preview -->
				{#if item}
					<div class="mb-4 rounded-lg border-2 border-red-200 bg-red-50 p-4">
						<h4 class="mb-3 text-sm font-semibold text-red-900">You are deleting:</h4>
						<div class="rounded-md bg-white p-4 border border-red-100">
							<!-- Primary fields (titles) -->
							{#if cardFields.primary.length > 0}
								<div class="space-y-1">
									{#each cardFields.primary as [fieldName, fieldDef]}
										<p class="text-lg font-semibold text-gray-900 break-words">
											{formatContentValue((item as ContentRecord)[fieldName])}
										</p>
									{/each}
								</div>
							{/if}

							<!-- Secondary fields (metadata) -->
							{#if cardFields.secondary.length > 0}
								<div class="mt-3 space-y-1">
									{#each cardFields.secondary as [fieldName, fieldDef]}
										<p class="text-sm text-gray-600">
											<span class="font-medium">{getFieldLabel(fieldName, fieldDef)}:</span>
											{formatContentValue((item as ContentRecord)[fieldName])}
										</p>
									{/each}
								</div>
							{/if}

							{#if item._filename}
								<p class="mt-3 text-xs text-gray-400 font-mono">{item._filename}</p>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Explanatory text about draft staging -->
				<p class="mb-6 text-sm text-gray-700">
					This deletion will be staged as a draft change. You can review it on the
					<a href="/pages/{discoveredConfig.slug}" class="text-blue-600 hover:underline font-medium">
						{config.label}
					</a> page before publishing.
				</p>

				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						deleting = true;
						return async ({ update }) => {
							await update();
							deleting = false;
						};
					}}
				>
					<div class="flex gap-3">
						<button
							type="submit"
							disabled={deleting}
							class="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
						>
							{deleting ? 'Deleting...' : 'Delete Item'}
						</button>
						<button
							type="button"
							onclick={() => (showDeleteConfirm = false)}
							disabled={deleting}
							class="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Keyboard shortcut help -->
	<KeyboardShortcutHelp />
</div>
