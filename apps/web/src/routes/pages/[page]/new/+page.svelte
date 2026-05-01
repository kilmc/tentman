<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { getConfigItemLabel } from '$lib/features/content-management/navigation';
	import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { draftBranch } from '$lib/stores/draft-branch';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { createContentDocument } from '$lib/content/service';
	import { registerUnsavedChangesGuard } from '$lib/features/forms/unsaved-guard';
	import type { FormDirtyState } from '$lib/features/forms/edit-session';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
	import { writeNavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import {
		addCollectionGroupToConfigSource,
		addNavigationGroupToManifest
	} from '$lib/features/content-management/navigation-group-options';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let packageBlocks = $state<SerializablePackageBlock[]>(data.packageBlocks ?? []);
	let blockRegistry = $state<BlockRegistry | null>(null);
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let formHasUnsavedChanges = $state(false);
	let filenameHasUnsavedChanges = $state(false);
	let filename = $state('');
	let filenameError = $state('');
	let blockRegistryError = $state<string | null>(data.blockRegistryError ?? null);
	let navigationManifest = $state<NavigationManifestState | null>(data.navigationManifest ?? null);
	let localError = $state<string | null>(null);
	let localLoadRequest = 0;

	const config = $derived(discoveredConfig?.config ?? null);
	const requiresFilename = $derived(false);
	const hasUnsavedChanges = $derived(formHasUnsavedChanges || filenameHasUnsavedChanges);
	const branchQuery = $derived(data.branch ? `?branch=${encodeURIComponent(data.branch)}` : '');
	const githubBlockRegistry = $derived.by(() => {
		if (isLocalMode || blockRegistryError) {
			return null;
		}

		return createBlockRegistry(blockConfigs, { packageBlocks });
	});

	function handleDirtyStateChange(state: FormDirtyState) {
		formHasUnsavedChanges = state.isDirty;
	}

	function applyRemoteData() {
		discoveredConfig = data.discoveredConfig;
		blockConfigs = data.blockConfigs ?? [];
		packageBlocks = data.packageBlocks ?? [];
		blockRegistry = null;
		blockRegistryError = data.blockRegistryError ?? null;
		navigationManifest = data.navigationManifest ?? null;
		formHasUnsavedChanges = false;
		filenameHasUnsavedChanges = false;
		localError = null;
		filename = '';
		filenameError = '';
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

	async function loadLocalConfig(pageSlug: string) {
		const requestId = ++localLoadRequest;

		await localContent.refresh();
		const contentState = get(localContent);

		if (requestId !== localLoadRequest) {
			return;
		}

		discoveredConfig = contentState.configs.find((entry) => entry.slug === pageSlug) ?? null;
		blockConfigs = contentState.blockConfigs;
		packageBlocks = [];
		blockRegistry = contentState.blockRegistry;
		blockRegistryError = contentState.blockRegistryError;
		navigationManifest = contentState.navigationManifest;
		formHasUnsavedChanges = false;
		filenameHasUnsavedChanges = false;
		localError = null;
		filename = '';
		filenameError = '';
	}

	$effect(() => {
		if (isLocalMode) {
			void loadLocalConfig(data.pageSlug);
			return;
		}

		localLoadRequest += 1;
		applyRemoteData();
	});

	async function handleAddSelectOption(input: {
		collection: string;
		id: string;
		value: string;
		label: string;
	}) {
		if (isLocalMode) {
			const repoState = get(localRepo);
			if (!repoState.backend) {
				throw new Error('No local repository is open.');
			}

			if (!discoveredConfig) {
				throw new Error('Collection config not found.');
			}

			const configSource = await repoState.backend.readTextFile(discoveredConfig.path);
			await repoState.backend.writeTextFile(
				discoveredConfig.path,
				addCollectionGroupToConfigSource(configSource, input)
			);
			const manifest = addNavigationGroupToManifest(navigationManifest?.manifest, input);
			await writeNavigationManifest(repoState.backend, manifest);
			await localContent.refresh({ force: true });
			navigationManifest = get(localContent).navigationManifest;
			return;
		}

		const response = await fetch('/api/repo/navigation-manifest', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				action: 'add-collection-group',
				branchName: get(draftBranch).branchName,
				...input
			})
		});

		if (!response.ok) {
			throw new Error(await response.text());
		}

		const result = await response.json();
		navigationManifest = result.navigationManifest;
		if (result.branchName && data.selectedRepo) {
			draftBranch.setBranch(result.branchName, data.selectedRepo.full_name);
		}
	}

	function prepareFormSubmit(event?: SubmitEvent): ContentRecord | null {
		if (!formGenerator || !discoveredConfig) {
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

	async function handleLocalCreate() {
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
		formHasUnsavedChanges = false;
		filenameHasUnsavedChanges = false;
		localError = null;

		try {
			const materialized = await materializeDraftAssets({
				backend: repoState.backend,
				content: formData
			});
			await createContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path,
				materialized.content,
				undefined
			);
			await Promise.all(materialized.cleanedRefs.map((ref) => draftAssetStore.delete(ref)));
			await localContent.refresh({ force: true });
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve(`/pages/${discoveredConfig.slug}`)}?published=true`);
		} catch (error) {
			formHasUnsavedChanges = true;
			localError = error instanceof Error ? error.message : 'Failed to create item';
		} finally {
			saving = false;
		}
	}
</script>

<div class="min-w-0">
	<div class="mb-5">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">
				New {config ? getConfigItemLabel(config) : 'Item'}
			</h1>
			{#if hasUnsavedChanges}
				<span
					class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
				>
					Unsaved changes
				</span>
			{/if}
		</div>
	</div>

	{#if form?.error || localError}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">Failed to create item</p>
			<p class="mt-1 text-sm text-red-700">{form?.error || localError}</p>
		</div>
	{/if}

	{#if isLocalMode}
		<form bind:this={currentForm} onsubmit={(event) => event.preventDefault()}>
			<input type="hidden" name="data" value="" />

			{#if requiresFilename}
				<div class="mb-5 border-b border-stone-200 pb-5">
					<label for="filename" class="mb-2 block text-sm font-medium text-stone-700">
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
								filenameHasUnsavedChanges = true;
							}}
							placeholder="e.g., 2025-11-30 or my-update"
							class="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
							class:border-red-500={filenameError}
							required
						/>
						<span class="text-sm text-stone-500">.md</span>
					</div>
					{#if filenameError}
						<p class="mt-1 text-sm text-red-600">{filenameError}</p>
					{:else}
						<p class="mt-1 text-xs text-stone-500">
							Enter a filename without the extension. Use lowercase letters, numbers, and hyphens.
						</p>
					{/if}
				</div>
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
			{:else if config}
				<FormGenerator
					bind:this={formGenerator}
					{config}
					{blockConfigs}
					{blockRegistry}
					initialData={{}}
					existingItems={[]}
					currentItemId={undefined}
					navigationManifest={navigationManifest?.manifest}
					onaddselectoption={handleAddSelectOption}
					ondirtystatechange={handleDirtyStateChange}
				/>
			{/if}

			<div class="mt-6 flex gap-3">
				<button
					type="button"
					onclick={() => void handleLocalCreate()}
					disabled={saving || !blockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Creating...' : 'Create Item'}
				</button>
				<a href={resolve(`/pages/${data.pageSlug}`)} class="tm-btn tm-btn-secondary"> Cancel </a>
			</div>
		</form>
	{:else}
		<form
			bind:this={currentForm}
			method="POST"
			action="?/createToPreview"
			onsubmit={prepareFormSubmit}
			use:enhance={() => {
				saving = true;
				formHasUnsavedChanges = false;
				filenameHasUnsavedChanges = false;
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

			{#if requiresFilename}
				<div class="mb-5 border-b border-stone-200 pb-5">
					<label for="filename" class="mb-2 block text-sm font-medium text-stone-700">
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
								filenameHasUnsavedChanges = true;
							}}
							placeholder="e.g., 2025-11-30 or my-update"
							class="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
							class:border-red-500={filenameError}
							required
						/>
						<span class="text-sm text-stone-500">.md</span>
					</div>
					{#if filenameError}
						<p class="mt-1 text-sm text-red-600">{filenameError}</p>
					{:else}
						<p class="mt-1 text-xs text-stone-500">
							Enter a filename without the extension. Use lowercase letters, numbers, and hyphens.
						</p>
					{/if}
				</div>
			{/if}

			{#if blockRegistryError}
				<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
					<p class="text-sm font-medium text-red-800">Failed to load block registry</p>
					<p class="mt-1 text-sm text-red-700">{blockRegistryError}</p>
				</div>
			{:else if config && githubBlockRegistry}
				<FormGenerator
					bind:this={formGenerator}
					{config}
					{blockConfigs}
					blockRegistry={githubBlockRegistry}
					initialData={{}}
					existingItems={[]}
					currentItemId={undefined}
					navigationManifest={navigationManifest?.manifest}
					onaddselectoption={handleAddSelectOption}
					ondirtystatechange={handleDirtyStateChange}
				/>
			{/if}

			<div class="mt-6 flex gap-3">
				<button
					type="submit"
					disabled={saving || !githubBlockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Creating...' : 'Create'}
				</button>
				<a href={resolve(`/pages/${data.pageSlug}`) + branchQuery} class="tm-btn tm-btn-secondary">
					Cancel
				</a>
			</div>
		</form>
	{/if}
</div>
