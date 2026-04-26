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
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { fetchContentDocument, saveContentDocument } from '$lib/content/service';
	import { registerUnsavedChangesGuard } from '$lib/features/forms/unsaved-guard';
	import type { FormDirtyState } from '$lib/features/forms/edit-session';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let packageBlocks = $state<SerializablePackageBlock[]>(data.packageBlocks ?? []);
	let blockRegistry = $state<BlockRegistry | null>(null);
	let content = $state(data.content);
	let contentError = $state(data.contentError);
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let blockRegistryError = $state<string | null>(data.blockRegistryError ?? null);
	let localError = $state<string | null>(null);
	let localLoadRequest = 0;
	let skipNextLocalRevisionSync = $state(false);

	const config = $derived(discoveredConfig?.config ?? null);
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
		content = data.content;
		contentError = data.contentError;
		blockRegistryError = data.blockRegistryError ?? null;
		hasUnsavedChanges = false;
		localError = null;
	}

	registerUnsavedChangesGuard({
		hasUnsavedChanges: () => hasUnsavedChanges,
		isSaving: () => saving
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

		return cleanup;
	});

	async function loadLocalContent(pageSlug: string, options: { refresh?: boolean } = {}) {
		const requestId = ++localLoadRequest;

		discoveredConfig = null;
		blockConfigs = [];
		packageBlocks = [];
		blockRegistry = null;
		content = null;
		contentError = null;
		blockRegistryError = null;
		localError = null;
		formGenerator = null;
		hasUnsavedChanges = false;
		if (options.refresh) {
			await localContent.refresh();
		}
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
			skipNextLocalRevisionSync = true;
			void loadLocalContent(data.pageSlug, { refresh: true });
			return;
		}

		skipNextLocalRevisionSync = false;
		localLoadRequest += 1;
		applyRemoteData();
	});

	$effect(() => {
		if (!isLocalMode || hasUnsavedChanges) {
			return;
		}

		const revision = $localContent.revision;
		if (revision === 0) {
			return;
		}

		if (skipNextLocalRevisionSync) {
			skipNextLocalRevisionSync = false;
			return;
		}

		void loadLocalContent(data.pageSlug);
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
		if (!formData || !discoveredConfig || !config) {
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
				materialized.content
			);
			await Promise.all(materialized.cleanedRefs.map((ref) => draftAssetStore.delete(ref)));
			await localContent.refresh({ force: true });
			await goto(`/pages/${discoveredConfig.slug}?published=true`);
		} catch (error) {
			hasUnsavedChanges = true;
			localError = error instanceof Error ? error.message : 'Failed to save local changes';
		} finally {
			saving = false;
		}
	}
</script>

<div class="min-w-0">
	{#if hasUnsavedChanges}
		<div class="mb-5">
			<span
				class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
			>
				Unsaved changes
			</span>
		</div>
	{/if}

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
	{:else if content === null || !config}
		<div class="rounded-md border border-stone-200 bg-white p-8 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else if isLocalMode}
		<form bind:this={currentForm} onsubmit={(event) => event.preventDefault()}>
			<input type="hidden" name="data" value="" />
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
				{#key `${data.pageSlug}:${JSON.stringify(content)}`}
					<FormGenerator
						bind:this={formGenerator}
						{config}
						{blockConfigs}
						{blockRegistry}
						initialData={content}
						existingItems={[]}
						currentItemId={undefined}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<div class="mt-6 flex gap-3">
				<button
					type="button"
					onclick={() => void handleLocalSave()}
					disabled={saving || !blockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
				<a href="/pages/{data.pageSlug}" class="tm-btn tm-btn-secondary"> Cancel </a>
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
			{#if blockRegistryError}
				<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
					<p class="text-sm font-medium text-red-800">Failed to load block registry</p>
					<p class="mt-1 text-sm text-red-700">{blockRegistryError}</p>
				</div>
			{:else if githubBlockRegistry}
				{#key `${data.pageSlug}:${JSON.stringify(content)}`}
					<FormGenerator
						bind:this={formGenerator}
						{config}
						{blockConfigs}
						blockRegistry={githubBlockRegistry}
						initialData={content}
						existingItems={[]}
						currentItemId={undefined}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<div class="mt-6 flex gap-3">
				<button
					type="submit"
					disabled={saving || !githubBlockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Saving...' : 'Continue'}
				</button>
				<a href={resolve(`/pages/${data.pageSlug}${branchQuery}`)} class="tm-btn tm-btn-secondary">
					Cancel
				</a>
			</div>
		</form>
	{/if}
</div>
