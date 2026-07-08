<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import PageStickyFooter from '$lib/components/PageStickyFooter.svelte';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { appendDraftAssetsToFormData } from '$lib/features/draft-assets/client';
	import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { toasts } from '$lib/stores/toasts';
	import { fetchContentDocument, saveContentDocument } from '$lib/content/service';
	import {
		clearEditorRecoverySnapshot,
		createEditorRecoverySnapshot,
		getContentFingerprint,
		resolveEditorRecoveryState,
		writeEditorRecoverySnapshot,
		type EditorRecoveryState
	} from '$lib/features/forms/editor-recovery';
	import {
		getEditorSaveStatusMeta,
		shouldShowEditorSaveStatus,
		type EditorSaveStatus
	} from '$lib/features/forms/editor-save-status';
	import { registerUnsavedChangesGuard } from '$lib/features/forms/unsaved-guard';
	import type { FormDirtyState } from '$lib/features/forms/edit-session';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = $derived(data.mode === 'local');

	function getInitialDiscoveredConfig() {
		return data.discoveredConfig;
	}

	function getInitialBlockConfigs() {
		return data.blockConfigs ?? [];
	}

	function getInitialPackageBlocks(): SerializablePackageBlock[] {
		return data.packageBlocks ?? [];
	}

	function getInitialContent() {
		return data.content;
	}

	function getInitialContentError() {
		return data.contentError;
	}

	function getInitialBlockRegistryError() {
		return data.blockRegistryError ?? null;
	}

	let discoveredConfig = $state(getInitialDiscoveredConfig());
	let blockConfigs = $state(getInitialBlockConfigs());
	let packageBlocks = $state<SerializablePackageBlock[]>(getInitialPackageBlocks());
	let blockRegistry = $state<BlockRegistry | null>(null);
	let content = $state(getInitialContent());
	let contentError = $state(getInitialContentError());
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let blockRegistryError = $state<string | null>(getInitialBlockRegistryError());
	let localError = $state<string | null>(null);
	let localLoadRequest = 0;
	let recoveryState = $state<EditorRecoveryState>({ kind: 'none' });
	let recoveryWriteTimer = $state<number | null>(null);
	const flashMessageKeys = ['saved', 'published', 'branch'] as const;

	const config = $derived(discoveredConfig?.config ?? null);
	const isDraftView = $derived(!isLocalMode && !!data.branch);
	const recoveryRouteKey = $derived(`${page.url.pathname}${page.url.search}`);
	const recoveryContextKey = $derived.by(() =>
		isLocalMode
			? `local:${$localRepo.backend?.cacheKey ?? 'none'}`
			: `github:${data.selectedRepo?.full_name ?? 'none'}:${data.branch ?? 'live'}`
	);
	const currentSaveError = $derived(form?.error ?? localError);
	const canSaveChanges = $derived.by(() => {
		const registryReady = isLocalMode ? !!blockRegistry : !!githubBlockRegistry;
		return hasUnsavedChanges && !saving && registryReady && !blockRegistryError;
	});
	const saveStatus = $derived.by<EditorSaveStatus>(() => {
		if (saving) {
			return 'saving';
		}
		if (currentSaveError) {
			return 'failed';
		}
		if (hasUnsavedChanges) {
			return 'unsaved';
		}
		return 'saved';
	});
	const saveStatusMeta = $derived(getEditorSaveStatusMeta(saveStatus));
	const showSaveStatus = $derived(shouldShowEditorSaveStatus(saveStatus));
	const githubBlockRegistry = $derived.by(() => {
		if (isLocalMode || blockRegistryError) {
			return null;
		}

		return createBlockRegistry(blockConfigs, { packageBlocks });
	});

	function handleDirtyStateChange(state: FormDirtyState) {
		hasUnsavedChanges = state.isDirty;

		if (!state.isDirty) {
			clearRecoveryDraft();
		}
	}

	function handleFormChange() {
		if (!hasUnsavedChanges) {
			return;
		}

		scheduleRecoveryDraftWrite();
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
		handleUrlMessages();

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

		return () => {
			cleanup();
			if (recoveryWriteTimer !== null) {
				window.clearTimeout(recoveryWriteTimer);
			}
		};
	});

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

		if (urlParams.get('saved') === 'true') {
			toasts.add(
				isLocalMode ? 'Changes saved to local files.' : 'Changes saved to draft!',
				'success'
			);
		}

		if (urlParams.get('published') === 'true') {
			toasts.add(
				isLocalMode ? 'Changes saved to local files.' : 'Changes published successfully!',
				'success'
			);
		}

		if (flashKey) {
			sessionStorage.setItem(flashKey, 'seen');
		}
	}

	async function loadLocalContent(pageSlug: string) {
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
			void loadLocalContent(data.pageSlug);
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

	$effect(() => {
		if (content === null || hasUnsavedChanges || saving || typeof localStorage === 'undefined') {
			return;
		}

		recoveryState = resolveEditorRecoveryState({
			storage: localStorage,
			routeKey: recoveryRouteKey,
			contextKey: recoveryContextKey,
			baselineFingerprint: getContentFingerprint(content)
		});
	});

	function persistRecoveryDraft() {
		if (
			!formGenerator ||
			!hasUnsavedChanges ||
			content === null ||
			typeof localStorage === 'undefined'
		) {
			return;
		}

		writeEditorRecoverySnapshot(
			localStorage,
			createEditorRecoverySnapshot({
				routeKey: recoveryRouteKey,
				contextKey: recoveryContextKey,
				baselineFingerprint: getContentFingerprint(content),
				session: formGenerator.exportRecoveryState()
			})
		);
	}

	function scheduleRecoveryDraftWrite() {
		if (typeof window === 'undefined') {
			return;
		}

		if (recoveryWriteTimer !== null) {
			window.clearTimeout(recoveryWriteTimer);
		}

		recoveryWriteTimer = window.setTimeout(() => {
			persistRecoveryDraft();
			recoveryWriteTimer = null;
		}, 150);
	}

	function clearRecoveryDraft() {
		if (recoveryWriteTimer !== null && typeof window !== 'undefined') {
			window.clearTimeout(recoveryWriteTimer);
			recoveryWriteTimer = null;
		}

		if (typeof localStorage !== 'undefined') {
			clearEditorRecoverySnapshot(localStorage, recoveryRouteKey);
		}

		if (recoveryState.kind !== 'none') {
			recoveryState = { kind: 'none' };
		}
	}

	function recoverDraft(snapshot = recoveryState.kind === 'none' ? null : recoveryState.snapshot) {
		if (!formGenerator || !snapshot) {
			return;
		}

		formGenerator.restoreRecoveryState(snapshot.session);
		recoveryState = { kind: 'none' };
		toasts.info('Recovered local unsaved changes.', 4000);
	}

	function recoverStaleDraft() {
		if (recoveryState.kind !== 'stale') {
			return;
		}

		recoverDraft(recoveryState.snapshot);
	}

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

		persistRecoveryDraft();
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
			clearRecoveryDraft();
			await localContent.refresh({ force: true });
			await goto(resolve(`/pages/${discoveredConfig.slug}/edit`) + '?published=true');
		} catch (error) {
			hasUnsavedChanges = true;
			localError = error instanceof Error ? error.message : 'Failed to save local changes';
		} finally {
			saving = false;
		}
	}
</script>

<div class="min-w-0">
	{#if showSaveStatus}
		<div class="mb-5">
			<span
				class={`rounded-full border px-2.5 py-1 text-xs font-semibold ${saveStatusMeta.className}`}
			>
				{saveStatusMeta.label}
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

	{#if recoveryState.kind === 'available'}
		<div class="mb-5 rounded-md border border-blue-200 bg-blue-50 p-4">
			<p class="text-sm font-medium text-blue-900">Local recovery available</p>
			<p class="mt-1 text-sm text-blue-800">
				Tentman found unsaved changes for this page. Recover them to continue editing, or discard
				the local recovery.
			</p>
			<div class="mt-3 flex flex-col gap-2 sm:flex-row">
				<button type="button" onclick={() => recoverDraft()} class="tm-btn tm-btn-primary">
					Recover changes
				</button>
				<button type="button" onclick={clearRecoveryDraft} class="tm-btn tm-btn-secondary">
					Discard recovery
				</button>
			</div>
		</div>
	{:else if recoveryState.kind === 'stale'}
		<div class="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4">
			<p class="text-sm font-medium text-amber-900">Saved content changed after this recovery</p>
			<p class="mt-1 text-sm text-amber-800">
				Tentman kept your local draft, but newer saved content is loaded now. Replace the editor
				with the recovered draft only if you want to review and re-save those older unsaved edits.
			</p>
			<div class="mt-3 flex flex-col gap-2 sm:flex-row">
				<button type="button" onclick={recoverStaleDraft} class="tm-btn tm-btn-primary">
					Replace with recovery
				</button>
				<button type="button" onclick={clearRecoveryDraft} class="tm-btn tm-btn-secondary">
					Discard recovery
				</button>
			</div>
		</div>
	{/if}

	{#if currentSaveError}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">Failed to save changes</p>
			<p class="mt-1 text-sm text-red-700">{currentSaveError}</p>
			<p class="mt-2 text-sm text-red-700">
				Your edits have not been discarded. You can retry from this page, and Tentman will keep a
				local recovery until a save succeeds.
			</p>
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
					<p class="text-sm font-medium text-red-800">Failed to load reusable blocks</p>
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
						configPath={discoveredConfig?.path}
						defaultAssetStoragePath={$localContent.rootConfig?.assets?.path}
						{blockConfigs}
						{blockRegistry}
						initialData={content}
						existingItems={[]}
						currentItemId={undefined}
						onchange={handleFormChange}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<PageStickyFooter>
				<button
					type="button"
					onclick={() => void handleLocalSave()}
					disabled={!canSaveChanges}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
			</PageStickyFooter>
		</form>
	{:else}
		<form
			bind:this={currentForm}
			method="POST"
			enctype="multipart/form-data"
			action="?/saveToPreview"
			onsubmit={prepareFormSubmit}
			use:enhance={async ({ formData, cancel }) => {
				let submittedRefs: string[] = [];
				try {
					localError = null;
					const encoded = formData.get('data');
					if (typeof encoded !== 'string' || encoded.length === 0) {
						cancel();
						return;
					}

					const contentData = JSON.parse(encoded) as ContentRecord;
					const appended = await appendDraftAssetsToFormData(formData, contentData);
					submittedRefs = appended.refs;
					persistRecoveryDraft();
					saving = true;
					hasUnsavedChanges = false;
				} catch (error) {
					localError =
						error instanceof Error ? error.message : 'Failed to prepare staged draft assets';
					hasUnsavedChanges = true;
					saving = false;
					cancel();
					return;
				}

				return async ({ update, result }) => {
					await update();
					if (result.type === 'redirect' || result.type === 'success') {
						await Promise.all(submittedRefs.map((ref) => draftAssetStore.delete(ref)));
						clearRecoveryDraft();
					} else {
						hasUnsavedChanges = true;
					}
					saving = false;
				};
			}}
		>
			<input type="hidden" name="data" value="" />
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
						configPath={discoveredConfig?.path}
						defaultAssetStoragePath={data.rootConfig?.assets?.path}
						{blockConfigs}
						blockRegistry={githubBlockRegistry}
						initialData={content}
						existingItems={[]}
						currentItemId={undefined}
						onchange={handleFormChange}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<PageStickyFooter>
				<button
					type="submit"
					disabled={!canSaveChanges}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
			</PageStickyFooter>
		</form>
	{/if}
</div>
