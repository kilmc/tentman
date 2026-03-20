<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import KeyboardShortcutHelp from '$lib/components/KeyboardShortcutHelp.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { get } from 'svelte/store';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { createContentDocument } from '$lib/content/service';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = data.mode === 'local';

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let blockRegistry = $state<BlockRegistry | null>(null);
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let filename = $state('');
	let filenameError = $state('');
	let blockRegistryError = $state<string | null>(null);
	let localError = $state<string | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);
	const requiresFilename = $derived(discoveredConfig?.config.content.mode === 'directory');

	function handleFieldsChanged() {
		hasUnsavedChanges = true;
	}

	beforeNavigate(({ cancel }) => {
		if (hasUnsavedChanges && !saving) {
			if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
				cancel();
			}
		}
	});

	onMount(() => {
		const cleanup = registerKeyboardShortcuts([
			{
				key: 's',
				meta: true,
				ctrl: true,
				callback: () => currentForm?.requestSubmit()
			},
			{
				key: 'Escape',
				callback: () => window.history.back()
			}
		]);

		if (isLocalMode) {
			void (async () => {
				await localContent.refresh();
				const contentState = get(localContent);
				discoveredConfig = contentState.configs.find((entry) => entry.slug === data.pageSlug) ?? null;
				blockConfigs = contentState.blockConfigs;
				blockRegistry = contentState.blockRegistry;
				blockRegistryError = contentState.blockRegistryError;
			})();
		}

		return cleanup;
	});

	function validateLocalForm(event?: SubmitEvent) {
		if (!formGenerator || !discoveredConfig) return false;

		const { data: formData, errors } = formGenerator.validate();
		if (errors.length > 0) {
			event?.preventDefault();
			return false;
		}

		if (requiresFilename) {
			const trimmedFilename = filename.trim();
			if (!trimmedFilename) {
				filenameError = 'Filename is required';
				event?.preventDefault();
				return false;
			}

			if (/[<>:"/\\|?*]/.test(trimmedFilename)) {
				filenameError = 'Filename contains invalid characters';
				event?.preventDefault();
				return false;
			}
		}

		const hiddenInput = currentForm?.querySelector('input[name="data"]');
		if (hiddenInput) {
			(hiddenInput as HTMLInputElement).value = JSON.stringify(formData);
		}

		return true;
	}

	async function handleLocalCreate() {
		if (!validateLocalForm() || !formGenerator || !discoveredConfig) {
			return;
		}

		const repoState = get(localRepo);
		if (!repoState.backend) {
			localError = 'No local repository is open.';
			return;
		}

		const { data: formData } = formGenerator.validate();
		saving = true;
		hasUnsavedChanges = false;
		localError = null;

		try {
			await createContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path,
				formData,
				requiresFilename ? { filename: filename.trim() } : undefined
			);
			await localContent.refresh();
			await goto(`/pages/${discoveredConfig.slug}?published=true`);
		} catch (error) {
			localError = error instanceof Error ? error.message : 'Failed to create item';
		} finally {
			saving = false;
		}
	}
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href="/pages/{data.pageSlug}" class="text-sm text-blue-600 hover:underline">&larr; Back</a>
	</div>

	<div class="mb-4 sm:mb-6">
		<h1 class="text-2xl font-bold sm:text-3xl">
			New {config?.label?.replace(/s$/, '') ?? 'Item'}
		</h1>
	</div>

	{#if form?.error || localError}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">Failed to create item</p>
			<p class="mt-1 text-sm text-red-700">{form?.error || localError}</p>
		</div>
	{/if}

	<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
			<h2 class="font-semibold">Item Details</h2>
		</div>
		<div class="p-6">
			{#if isLocalMode}
				<form bind:this={currentForm} onsubmit={(event) => event.preventDefault()}>
					<input type="hidden" name="data" value="" />

					{#if requiresFilename}
						<div class="mb-6 border-b border-gray-200 pb-6">
							<label for="filename" class="mb-2 block text-sm font-medium text-gray-700">
								Filename <span class="text-red-500">*</span>
							</label>
							<div class="flex items-center gap-2">
								<input
									type="text"
									id="filename"
									name="newFilename"
									bind:value={filename}
									oninput={() => {
										filenameError = '';
										hasUnsavedChanges = true;
									}}
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

					{#if blockRegistryError}
						<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
							<p class="text-sm font-medium text-red-800">Failed to load block adapters</p>
							<p class="mt-1 text-sm text-red-700">{blockRegistryError}</p>
						</div>
					{:else if !blockRegistry}
						<div class="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
							Loading block registry...
						</div>
					{:else if config}
						<FormGenerator
							bind:this={formGenerator}
							{config}
							{blockConfigs}
							{blockRegistry}
							initialData={{}}
							existingItems={[]}
							currentItemId={undefined}
							onvalidate={handleFieldsChanged}
						/>
					{/if}

					<div class="mt-6 flex gap-3">
						<button
							type="button"
							onclick={() => void handleLocalCreate()}
							disabled={saving || !blockRegistry || !!blockRegistryError}
							class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
						>
							{saving ? 'Creating...' : 'Create Item'}
						</button>
						<a
							href="/pages/{data.pageSlug}"
							class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Cancel
						</a>
					</div>
				</form>
			{:else}
				<form
					bind:this={currentForm}
					method="POST"
					action="?/createToPreview"
					onsubmit={validateLocalForm}
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

					{#if requiresFilename}
						<div class="mb-6 border-b border-gray-200 pb-6">
							<label for="filename" class="mb-2 block text-sm font-medium text-gray-700">
								Filename <span class="text-red-500">*</span>
							</label>
							<div class="flex items-center gap-2">
								<input
									type="text"
									id="filename"
									name="newFilename"
									bind:value={filename}
									oninput={() => {
										filenameError = '';
										hasUnsavedChanges = true;
									}}
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

					{#if config}
						<FormGenerator
							bind:this={formGenerator}
							{config}
							{blockConfigs}
							initialData={{}}
							existingItems={[]}
							currentItemId={undefined}
							onvalidate={handleFieldsChanged}
						/>
					{/if}

					<div class="mt-6 flex gap-3">
						<button
							type="submit"
							disabled={saving}
							class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
						>
							{saving ? 'Creating...' : 'Create'}
						</button>
						<a
							href="/pages/{data.pageSlug}"
							class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Cancel
						</a>
					</div>
				</form>
			{/if}
		</div>
	</div>

	<KeyboardShortcutHelp />
</div>
