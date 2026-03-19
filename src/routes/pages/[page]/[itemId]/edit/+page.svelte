<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import KeyboardShortcutHelp from '$lib/components/KeyboardShortcutHelp.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { enhance } from '$app/forms';
	import { goto, beforeNavigate } from '$app/navigation';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { getFieldLabel } from '$lib/types/config';
	import { getCardFields } from '$lib/features/forms/helpers';
	import { findContentItem, formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import {
		deleteContentDocument,
		fetchContentDocument,
		saveContentDocument
	} from '$lib/content/service';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = data.mode === 'local';

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let item = $state(data.item);
	let contentError = $state(data.contentError);
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);
	let localError = $state<string | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);
	const cardFields = $derived(config ? getCardFields(config) : { primary: [], secondary: [] });

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
			{ key: 's', meta: true, ctrl: true, callback: () => currentForm?.requestSubmit() },
			{ key: 'Escape', callback: () => window.history.back() }
		]);

		if (isLocalMode) {
			void loadLocalItem();
		}

		return cleanup;
	});

	async function loadLocalItem() {
		await localContent.refresh();
		const repoState = get(localRepo);
		const contentState = get(localContent);

		discoveredConfig = contentState.configs.find((entry) => entry.slug === data.pageSlug) ?? null;
		blockConfigs = contentState.blockConfigs;
		if (!repoState.backend || !discoveredConfig) {
			contentError = 'Configuration not found';
			return;
		}

		try {
			const loadedContent = await fetchContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path
			);

			if (Array.isArray(loadedContent)) {
				item =
					findContentItem(
						loadedContent,
						discoveredConfig.config,
						data.itemId
					) ?? null;
			}
		} catch (error) {
			contentError = error instanceof Error ? error.message : 'Failed to load content';
		}
	}

	function validateForm(event?: SubmitEvent) {
		if (!formGenerator) return false;
		const { data: formData, errors } = formGenerator.validate();
		if (errors.length > 0) {
			event?.preventDefault();
			return false;
		}

		const hiddenInput = currentForm?.querySelector('input[name="data"]');
		if (hiddenInput) {
			(hiddenInput as HTMLInputElement).value = JSON.stringify(formData);
		}

		return true;
	}

	async function handleLocalSave() {
		if (!validateForm() || !formGenerator || !discoveredConfig) {
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
			await saveContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path,
				formData,
				discoveredConfig.config.content.mode === 'directory'
					? { filename: item?._filename }
					: { itemId: data.itemId }
			);
			await localContent.refresh();
			await goto(`/pages/${discoveredConfig.slug}?published=true`);
		} catch (error) {
			localError = error instanceof Error ? error.message : 'Failed to save changes';
		} finally {
			saving = false;
		}
	}

	async function handleLocalDelete() {
		if (!discoveredConfig) return;

		const repoState = get(localRepo);
		if (!repoState.backend) {
			localError = 'No local repository is open.';
			return;
		}

		deleting = true;
		localError = null;

		try {
			await deleteContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path,
				discoveredConfig.config.content.mode === 'directory'
					? { filename: item?._filename, itemId: data.itemId }
					: { itemId: data.itemId }
			);
			await localContent.refresh();
			await goto(`/pages/${discoveredConfig.slug}?deleted=true`);
		} catch (error) {
			localError = error instanceof Error ? error.message : 'Failed to delete item';
		} finally {
			deleting = false;
			showDeleteConfirm = false;
		}
	}

	function getItemTitle(): string {
		if (!item) return 'Item';
		const firstField = cardFields.primary[0] ?? cardFields.secondary[0];
		if (firstField) {
			const value = item[firstField.id];
			if (value) return String(value);
		}
		return data.itemId;
	}
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href="/pages/{data.pageSlug}" class="text-sm text-blue-600 hover:underline">&larr; Back</a>
	</div>

	<div class="mb-4 sm:mb-6">
		<h1 class="text-2xl font-bold sm:text-3xl">Edit {config?.label?.replace(/s$/, '') ?? 'Item'}</h1>
		<p class="mt-1 text-gray-600">{getItemTitle()}</p>
	</div>

	{#if form?.error || localError}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">Failed to save changes</p>
			<p class="mt-1 text-sm text-red-700">{form?.error || localError}</p>
		</div>
	{/if}

	{#if contentError}
		<div class="rounded-lg border border-red-200 bg-red-50 p-6">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if item === null || !config}
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else}
		<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
				<h2 class="font-semibold">Edit Item</h2>
			</div>
				<div class="p-6">
					{#if isLocalMode}
						<form bind:this={currentForm} onsubmit={(event) => event.preventDefault()}>
							<input type="hidden" name="data" value="" />
							{#if item?._filename}
								<input type="hidden" name="filename" value={item._filename} />
							{/if}
							<FormGenerator
								bind:this={formGenerator}
								{config}
								{blockConfigs}
								initialData={item}
								existingItems={[]}
								currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
								onvalidate={handleFieldsChanged}
							/>
							<div class="mt-6 flex gap-3">
								<button
									type="button"
									onclick={() => void handleLocalSave()}
									disabled={saving}
									class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
								>
									{saving ? 'Saving...' : 'Save Changes'}
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
							action="?/saveToPreview"
							onsubmit={validateForm}
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
								{blockConfigs}
								initialData={item}
								existingItems={[]}
								currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
								onvalidate={handleFieldsChanged}
							/>
							<div class="mt-6 flex gap-3">
								<button
									type="submit"
									disabled={saving}
									class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
								>
									{saving ? 'Saving...' : 'Continue'}
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

			<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
				<h3 class="mb-2 text-sm font-semibold text-gray-900">Danger Zone</h3>
				<p class="mb-3 text-sm text-gray-600">
					Once you delete this item, it will be permanently removed from the repository.
				</p>
				<button
					type="button"
					onclick={() => (showDeleteConfirm = true)}
					class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
				>
					Delete {config.label.replace(/s$/, '')}
				</button>
			</div>
		</div>
	{/if}

	{#if showDeleteConfirm}
		<div class="fixed inset-0 z-50 flex items-center justify-center">
			<button
				type="button"
				class="absolute inset-0 bg-black/50"
				aria-label="Close delete confirmation"
				onclick={() => (showDeleteConfirm = false)}
			></button>
			<div class="relative mx-4 w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-2xl">
				<h3 class="mb-4 text-lg font-semibold text-gray-900">Confirm Delete</h3>
				{#if item}
					<div class="mb-4 rounded-lg border-2 border-red-200 bg-red-50 p-4">
						<h4 class="mb-3 text-sm font-semibold text-red-900">You are deleting:</h4>
						<div class="rounded-md border border-red-100 bg-white p-4">
							{#if cardFields.primary.length > 0}
								<div class="space-y-1">
									{#each cardFields.primary as block}
										<p class="break-words text-lg font-semibold text-gray-900">
											{formatContentValue((item as ContentRecord)[block.id])}
										</p>
									{/each}
								</div>
							{/if}

							{#if cardFields.secondary.length > 0}
								<div class="mt-3 space-y-1">
									{#each cardFields.secondary as block}
										<p class="text-sm text-gray-600">
											<span class="font-medium">{block.label ?? block.id}:</span>
											{formatContentValue((item as ContentRecord)[block.id])}
										</p>
									{/each}
								</div>
							{/if}

							{#if item._filename}
								<p class="mt-3 font-mono text-xs text-gray-400">{item._filename}</p>
							{/if}
						</div>
					</div>
				{/if}

				<p class="mb-6 text-sm text-gray-700">
					{isLocalMode
						? 'This will delete the file or entry from your local checkout immediately.'
						: 'This deletion will be staged as a draft change.'}
				</p>

				{#if isLocalMode}
					<div class="flex gap-3">
						<button
							type="button"
							disabled={deleting}
							onclick={handleLocalDelete}
							class="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
						>
							{deleting ? 'Deleting...' : 'Delete Item'}
						</button>
						<button
							type="button"
							onclick={() => (showDeleteConfirm = false)}
							class="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Cancel
						</button>
					</div>
				{:else}
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
								class="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
							>
								{deleting ? 'Deleting...' : 'Delete Item'}
							</button>
							<button
								type="button"
								onclick={() => (showDeleteConfirm = false)}
								class="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	{/if}

	<KeyboardShortcutHelp />
</div>
