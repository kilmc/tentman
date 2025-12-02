<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import KeyboardShortcutHelp from '$lib/components/KeyboardShortcutHelp.svelte';
	import { enhance } from '$app/forms';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { discoveredConfig } = data;
	const { config } = discoveredConfig;

	// DEBUG: Log config on mount
	console.log('=== NEW PAGE DEBUG ===');
	console.log('Config:', config);
	console.log('Config fields:', config.fields);
	console.log('Type:', discoveredConfig.type);

	// Form state
	let formGenerator: FormGenerator | null = null;
	let currentForm: HTMLFormElement | null = null;
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let filename = $state('');
	let filenameError = $state('');

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

		// DEBUG: Log form data
		console.log('=== FORM SUBMIT DEBUG ===');
		console.log('Form data from validate():', formData);
		console.log('Validation errors:', errors);
		console.log('Filename:', filename);

		// If there are validation errors, prevent submission
		if (errors.length > 0) {
			event.preventDefault();
			return false;
		}

		// For collections, validate filename
		if (discoveredConfig.type === 'collection') {
			const trimmedFilename = filename.trim();

			if (!trimmedFilename) {
				filenameError = 'Filename is required';
				event.preventDefault();
				return false;
			}

			// Check for invalid characters
			if (/[<>:"/\\|?*]/.test(trimmedFilename)) {
				filenameError = 'Filename contains invalid characters';
				event.preventDefault();
				return false;
			}

			filenameError = '';
		}

		// Update the hidden input with validated data
		const hiddenInput = currentForm?.querySelector('input[name="data"]') as HTMLInputElement;
		if (hiddenInput) {
			hiddenInput.value = JSON.stringify(formData);
			console.log('Hidden input value:', hiddenInput.value);
		}

		// Let the form submit naturally
		return true;
	}
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href="/pages/{discoveredConfig.slug}" class="text-sm text-blue-600 hover:underline"
			>&larr; Back to {config.label}</a
		>
	</div>

	<div class="mb-4 sm:mb-6">
		<h1 class="text-2xl sm:text-3xl font-bold">
			New {config.label.replace(/s$/, '')}
		</h1>
	</div>

	{#if form?.error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">✗ Failed to create item</p>
			<p class="mt-1 text-sm text-red-700">{form.error}</p>
		</div>
	{/if}

	<!-- Create form -->
	<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
			<h2 class="font-semibold">Item Details</h2>
		</div>
		<div class="p-6">
			<form
				bind:this={currentForm}
				method="POST"
				action="?/createToPreview"
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

				{#if discoveredConfig.type === 'collection'}
					<div class="mb-6 pb-6 border-b border-gray-200">
						<label for="filename" class="block text-sm font-medium text-gray-700 mb-2">
							Filename <span class="text-red-500">*</span>
						</label>
						<div class="flex items-center gap-2">
							<input
								type="text"
								id="filename"
								name="newFilename"
								bind:value={filename}
								oninput={() => { filenameError = ''; hasUnsavedChanges = true; }}
								placeholder="e.g., 2025-11-30 or my-update"
								class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								class:border-red-500={filenameError}
								required
							/>
							<span class="text-sm text-gray-500">.md</span>
						</div>
						{#if filenameError}
							<p class="mt-1 text-sm text-red-600">{filenameError}</p>
						{:else}
							<p class="mt-1 text-xs text-gray-500">
								Enter a filename without the extension. Use lowercase letters, numbers, and hyphens.
							</p>
						{/if}
					</div>
				{/if}

				<FormGenerator
					bind:this={formGenerator}
					{config}
					initialData={{}}
					existingItems={[]}
					currentItemId={undefined}
					onvalidate={handleFieldsChanged}
				/>
				<div class="mt-6 flex gap-3">
					<button
						type="submit"
						disabled={saving}
						class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
					>
						{saving ? 'Creating...' : 'Create'}
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
	</div>

	<!-- Keyboard shortcut help -->
	<KeyboardShortcutHelp />
</div>
