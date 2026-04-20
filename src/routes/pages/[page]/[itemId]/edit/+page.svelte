<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { getCardFields } from '$lib/features/forms/helpers';
	import { getConfigItemLabel } from '$lib/features/content-management/navigation';
	import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { findContentItem, formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import {
		deleteContentDocument,
		fetchContentDocument,
		saveContentDocument
	} from '$lib/content/service';
	import { registerUnsavedChangesGuard } from '$lib/features/forms/unsaved-guard';
	import type { FormDirtyState } from '$lib/features/forms/edit-session';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let packageBlocks = $state<SerializablePackageBlock[]>(data.packageBlocks ?? []);
	let blockRegistry = $state<BlockRegistry | null>(null);
	let item = $state(data.item);
	let contentError = $state(data.contentError);
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);
	let blockRegistryError = $state<string | null>(data.blockRegistryError ?? null);
	let localError = $state<string | null>(null);
	let localLoadRequest = 0;

	const config = $derived(discoveredConfig?.config ?? null);
	const cardFields = $derived(config ? getCardFields(config) : { primary: [], secondary: [] });
	const isDraftView = $derived(!isLocalMode && !!data.branch);
	const branchQuery = $derived(data.branch ? `?branch=${encodeURIComponent(data.branch)}` : '');
	const githubBlockRegistry = $derived.by(() => {
		if (isLocalMode || blockRegistryError) {
			return null;
		}

		return createBlockRegistry(blockConfigs, { packageBlocks });
	});

	function handleDirtyStateChange(state: FormDirtyState) {
		hasUnsavedChanges = state.isDirty;
	}

	function applyRemoteData() {
		discoveredConfig = data.discoveredConfig;
		blockConfigs = data.blockConfigs ?? [];
		packageBlocks = data.packageBlocks ?? [];
		blockRegistry = null;
		item = data.item;
		contentError = data.contentError;
		blockRegistryError = data.blockRegistryError ?? null;
		hasUnsavedChanges = false;
		localError = null;
	}

	registerUnsavedChangesGuard({
		hasUnsavedChanges: () => hasUnsavedChanges,
		isSaving: () => saving || deleting
	});

	onMount(() => {
		const cleanup = registerKeyboardShortcuts([
			{ key: 's', meta: true, ctrl: true, callback: () => currentForm?.requestSubmit() },
			{ key: 'Escape', callback: () => window.history.back() }
		]);

		return cleanup;
	});

	async function loadLocalItem(pageSlug: string, itemId: string) {
		const requestId = ++localLoadRequest;

		discoveredConfig = null;
		blockConfigs = [];
		packageBlocks = [];
		blockRegistry = null;
		item = null;
		contentError = null;
		blockRegistryError = null;
		localError = null;
		formGenerator = null;
		hasUnsavedChanges = false;
		await localContent.refresh();
		const repoState = get(localRepo);
		const contentState = get(localContent);

		if (requestId !== localLoadRequest) {
			return;
		}

		discoveredConfig = contentState.configs.find((entry) => entry.slug === pageSlug) ?? null;
		blockConfigs = contentState.blockConfigs;
		packageBlocks = [];
		blockRegistry = contentState.blockRegistry;
		blockRegistryError = contentState.blockRegistryError;
		hasUnsavedChanges = false;
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

			if (requestId !== localLoadRequest) {
				return;
			}

			if (Array.isArray(loadedContent)) {
				item = findContentItem(loadedContent, discoveredConfig.config, itemId) ?? null;
			}
		} catch (error) {
			if (requestId !== localLoadRequest) {
				return;
			}

			contentError = error instanceof Error ? error.message : 'Failed to load content';
		}
	}

	$effect(() => {
		if (isLocalMode) {
			void loadLocalItem(data.pageSlug, data.itemId);
			return;
		}

		localLoadRequest += 1;
		applyRemoteData();
	});

	$effect(() => {
		if (!data.branch || !data.selectedRepo || isLocalMode) {
			return;
		}

		const repoFullName = `${data.selectedRepo.owner}/${data.selectedRepo.name}`;
		draftBranchStore.setBranch(data.branch, repoFullName);
	});

	function prepareFormSubmit(event?: SubmitEvent): ContentRecord | null {
		if (!formGenerator) {
			event?.preventDefault();
			return null;
		}

		const result = formGenerator.prepareSubmit();
		if (!result.ok || (result.errors?.length ?? 0) > 0) {
			event?.preventDefault();
			return null;
		}

		const hiddenInput = currentForm?.querySelector('input[name="data"]');
		if (hiddenInput) {
			(hiddenInput as HTMLInputElement).value = JSON.stringify(result.data);
		}

		return result.data as ContentRecord;
	}

	async function handleLocalSave() {
		const formData = prepareFormSubmit();
		if (!formData || !discoveredConfig) {
			return;
		}

		const repoState = get(localRepo);
		if (!repoState.backend) {
			localError = 'No local repository is open.';
			return;
		}

		saving = true;
		hasUnsavedChanges = false;
		localError = null;

		try {
			const materialized = await materializeDraftAssets({
				backend: repoState.backend,
				content: formData
			});
			await saveContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path,
				materialized.content,
				discoveredConfig.config.content.mode === 'directory'
					? { filename: item?._filename }
					: { itemId: data.itemId }
			);
			await Promise.all(materialized.cleanedRefs.map((ref) => draftAssetStore.delete(ref)));
			await localContent.refresh({ force: true });
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve(`/pages/${discoveredConfig.slug}`)}?published=true`);
		} catch (error) {
			hasUnsavedChanges = true;
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
			await localContent.refresh({ force: true });
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve(`/pages/${discoveredConfig.slug}`)}?deleted=true`);
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

<div class="min-w-0">
	<div class="mb-5">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">
				{getItemTitle()}
			</h1>
			{#if hasUnsavedChanges}
				<span
					class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
				>
					Unsaved changes
				</span>
			{/if}
		</div>
		{#if config}
			<p class="mt-1 text-sm text-stone-500">{getConfigItemLabel(config)}</p>
		{/if}
	</div>

	{#if isDraftView}
		<div class="mb-5 rounded-md border border-stone-200 bg-stone-100 p-3">
			<p class="text-sm font-medium text-stone-900">Editing draft content</p>
			<p class="mt-1 text-sm text-stone-600">
				Changes will continue from
				<code class="rounded bg-white px-1 text-xs">{data.branch}</code>
			</p>
		</div>
	{/if}

	{#if form?.error || localError}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">Failed to save changes</p>
			<p class="mt-1 text-sm text-red-700">{form?.error || localError}</p>
		</div>
	{/if}

	{#if contentError}
		<div class="rounded-md border border-red-200 bg-red-50 p-4">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if item === null || !config}
		<div class="rounded-md border border-stone-200 bg-white p-8 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else if isLocalMode}
		<form bind:this={currentForm} onsubmit={(event) => event.preventDefault()}>
			<input type="hidden" name="data" value="" />
			{#if item?._filename}
				<input type="hidden" name="filename" value={item._filename} />
			{/if}
			{#if blockRegistryError}
				<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
					<p class="text-sm font-medium text-red-800">Failed to load block adapters</p>
					<p class="mt-1 text-sm text-red-700">{blockRegistryError}</p>
				</div>
			{:else if !blockRegistry}
				<div class="rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
					Loading block registry...
				</div>
			{:else}
				{#key `${data.pageSlug}:${data.itemId}:${item?._filename ?? ''}:${JSON.stringify(item)}`}
					<FormGenerator
						bind:this={formGenerator}
						{config}
						{blockConfigs}
						{blockRegistry}
						initialData={item}
						existingItems={[]}
						currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<div class="mt-6 flex flex-wrap gap-3">
				<button
					type="button"
					onclick={() => void handleLocalSave()}
					disabled={saving || !blockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
				<a href={resolve(`/pages/${data.pageSlug}`)} class="tm-btn tm-btn-secondary"> Cancel </a>
				<button
					type="button"
					onclick={() => (showDeleteConfirm = true)}
					class="tm-btn border-red-600 bg-red-600 text-white hover:bg-red-700"
				>
					Delete {getConfigItemLabel(config)}
				</button>
			</div>
		</form>
	{:else}
		<form
			bind:this={currentForm}
			method="POST"
			action="?/saveToPreview"
			onsubmit={prepareFormSubmit}
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
			{#if data.branch}
				<input type="hidden" name="branch" value={data.branch} />
			{/if}
			{#if item?._filename}
				<input type="hidden" name="filename" value={item._filename} />
			{/if}
			{#if blockRegistryError}
				<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
					<p class="text-sm font-medium text-red-800">Failed to load block registry</p>
					<p class="mt-1 text-sm text-red-700">{blockRegistryError}</p>
				</div>
			{:else if githubBlockRegistry}
				{#key `${data.pageSlug}:${data.itemId}:${item?._filename ?? ''}:${JSON.stringify(item)}`}
					<FormGenerator
						bind:this={formGenerator}
						{config}
						{blockConfigs}
						blockRegistry={githubBlockRegistry}
						initialData={item}
						existingItems={[]}
						currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<div class="mt-6 flex flex-wrap gap-3">
				<button
					type="submit"
					disabled={saving || !githubBlockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Saving...' : 'Continue'}
				</button>
				<a
					href={resolve(`/pages/${data.pageSlug}/${data.itemId}${branchQuery}`)}
					class="tm-btn tm-btn-secondary"
				>
					Cancel
				</a>
			</div>
		</form>
	{/if}

	{#if showDeleteConfirm}
		<div class="fixed inset-0 z-50 flex items-center justify-center">
			<button
				type="button"
				class="absolute inset-0 bg-black/50"
				aria-label="Close delete confirmation"
				onclick={() => (showDeleteConfirm = false)}
			></button>
			<div
				class="relative mx-4 w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-2xl"
			>
				<h3 class="mb-4 text-lg font-semibold text-gray-900">Confirm Delete</h3>
				{#if item}
					<div class="mb-4 rounded-lg border-2 border-red-200 bg-red-50 p-4">
						<h4 class="mb-3 text-sm font-semibold text-red-900">You are deleting:</h4>
						<div class="rounded-md border border-red-100 bg-white p-4">
							{#if cardFields.primary.length > 0}
								<div class="space-y-1">
									{#each cardFields.primary as block (block.id)}
										<p class="text-lg font-semibold break-words text-gray-900">
											{formatContentValue((item as ContentRecord)[block.id])}
										</p>
									{/each}
								</div>
							{/if}

							{#if cardFields.secondary.length > 0}
								<div class="mt-3 space-y-1">
									{#each cardFields.secondary as block (block.id)}
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
						{#if data.branch}
							<input type="hidden" name="branch" value={data.branch} />
						{/if}
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
</div>
