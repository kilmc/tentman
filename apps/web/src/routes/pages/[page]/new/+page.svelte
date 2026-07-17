<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { SerializablePackageBlock } from '$lib/blocks/packages';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import PageStickyFooter from '$lib/components/PageStickyFooter.svelte';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { getConfigItemLabel } from '$lib/features/content-management/navigation';
	import { appendDraftAssetsToFormData } from '$lib/features/draft-assets/client';
	import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { draftBranch } from '$lib/stores/draft-branch';
	import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { toasts } from '$lib/stores/toasts';
	import { createContentDocument, fetchContentDocument } from '$lib/content/service';
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
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
	import { manageCollectionGroups } from '$lib/features/content-management/navigation-manifest';
	import { getCollectionConfigReferences } from '$lib/features/content-management/config';
	import {
		buildCollectionFilePath,
		getCollectionFilenameBase,
		getTemplateInfo
	} from '$lib/features/content-management/transforms';
	import { resolveConfigPath } from '$lib/utils/validation';
	import { createWorkflowMutationResult } from '$lib/repository/workflow-mutations';
	import { markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';

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

	function getInitialBlockRegistryError() {
		return data.blockRegistryError ?? null;
	}

	function getInitialNavigationManifest() {
		return data.navigationManifest ?? null;
	}

	function getInitialExistingItems() {
		return data.existingItems ?? [];
	}

	let discoveredConfig = $state(getInitialDiscoveredConfig());
	let blockConfigs = $state(getInitialBlockConfigs());
	let packageBlocks = $state<SerializablePackageBlock[]>(getInitialPackageBlocks());
	let blockRegistry = $state<BlockRegistry | null>(null);
	let formGenerator = $state<FormGenerator | null>(null);
	let existingItems = $state<ContentRecord[]>(getInitialExistingItems());
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let formHasUnsavedChanges = $state(false);
	let filenameHasUnsavedChanges = $state(false);
	let filename = $state('');
	let filenameError = $state('');
	let blockRegistryError = $state<string | null>(getInitialBlockRegistryError());
	let navigationManifest = $state<NavigationManifestState | null>(getInitialNavigationManifest());
	let localError = $state<string | null>(null);
	let localLoadRequest = 0;
	let recoveryState = $state<EditorRecoveryState>({ kind: 'none' });
	let recoveryWriteTimer = $state<number | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);
	const groupManagementCollections = $derived(
		discoveredConfig
			? getCollectionConfigReferences({
					...discoveredConfig.config,
					slug: discoveredConfig.slug
				})
			: []
	);
	const requiresFilename = $derived(false);
	const hasUnsavedChanges = $derived(formHasUnsavedChanges || filenameHasUnsavedChanges);
	const recoveryRouteKey = $derived(`${page.url.pathname}${page.url.search}`);
	const recoveryContextKey = $derived.by(() =>
		isLocalMode
			? `local:${$localRepo.backend?.cacheKey ?? 'none'}`
			: `github:${data.selectedRepo?.full_name ?? 'none'}:${data.branch ?? 'live'}`
	);
	const currentSaveError = $derived(form?.error ?? localError);
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
		return 'not-saved';
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
		formHasUnsavedChanges = state.isDirty;

		if (!state.isDirty && !filenameHasUnsavedChanges) {
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
		blockRegistryError = data.blockRegistryError ?? null;
		navigationManifest = data.navigationManifest ?? null;
		existingItems = data.existingItems ?? [];
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
		markWorkflowReadiness({
			workflow: 'rich-editor-interactive',
			mark: 'rich-editor-interactive',
			route: `/pages/${data.pageSlug}/new`,
			slug: data.pageSlug
		});
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

		const repoState = get(localRepo);
		if (!repoState.backend || !discoveredConfig) {
			existingItems = [];
			return;
		}

		try {
			const loadedContent = await fetchContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path
			);
			existingItems = Array.isArray(loadedContent) ? loadedContent : [];
		} catch {
			existingItems = [];
		}
	}

	$effect(() => {
		if (isLocalMode) {
			void loadLocalConfig(data.pageSlug);
			return;
		}

		localLoadRequest += 1;
		applyRemoteData();
	});

	$effect(() => {
		if (hasUnsavedChanges || saving || typeof localStorage === 'undefined') {
			return;
		}

		recoveryState = resolveEditorRecoveryState({
			storage: localStorage,
			routeKey: recoveryRouteKey,
			contextKey: recoveryContextKey,
			baselineFingerprint: getContentFingerprint({})
		});
	});

	function persistRecoveryDraft() {
		if (!formGenerator || !hasUnsavedChanges || typeof localStorage === 'undefined') {
			return;
		}

		writeEditorRecoverySnapshot(
			localStorage,
			createEditorRecoverySnapshot({
				routeKey: recoveryRouteKey,
				contextKey: recoveryContextKey,
				baselineFingerprint: getContentFingerprint({}),
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

	function ensureFilenameExtension(filenameBase: string, extension: string): string {
		return filenameBase.includes('.') ? filenameBase : `${filenameBase}${extension}`;
	}

	function getCreatedItemCacheInvalidationPaths(contentData: ContentRecord): string[] {
		if (!discoveredConfig || typeof discoveredConfig.config.content.path !== 'string') {
			return [];
		}

		const contentPath = resolveConfigPath(
			discoveredConfig.path,
			discoveredConfig.config.content.path
		);
		const itemPath =
			discoveredConfig.config.content.mode === 'directory'
				? buildCollectionFilePath(
						contentPath,
						ensureFilenameExtension(
							filename || getCollectionFilenameBase(discoveredConfig.config, contentData),
							getTemplateInfo(discoveredConfig.path, discoveredConfig.config).templateExt
						)
					)
				: contentPath;

		return [itemPath];
	}

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

			await manageCollectionGroups(
				repoState.backend,
				discoveredConfig,
				{
					action: 'create',
					id: input.id,
					label: input.label,
					value: input.value
				},
				navigationManifest?.manifest
			);
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
				action: 'manage-collection-groups',
				collection: input.collection,
				mutation: {
					action: 'create',
					id: input.id,
					label: input.label,
					value: input.value
				}
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

		persistRecoveryDraft();
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
			const changedPaths = getCreatedItemCacheInvalidationPaths(materialized.content);
			const mutation = createWorkflowMutationResult({
				mode: 'local',
				intent: {
					type: 'create-item',
					slug: discoveredConfig.slug
				},
				message: 'Item created in local files.',
				changedPaths,
				redirect: {
					href: `${resolve(`/pages/${discoveredConfig.slug}`)}?published=true`
				},
				recoveryCleanup: {
					clearEditorRecovery: true,
					draftAssetRefs: materialized.cleanedRefs
				},
				refresh: {
					workspace: true,
					collections: [discoveredConfig.slug],
					cachePaths: changedPaths
				}
			});

			await Promise.all(
				mutation.recoveryCleanup.draftAssetRefs.map((ref) => draftAssetStore.delete(ref))
			);
			if (mutation.recoveryCleanup.clearEditorRecovery) {
				clearRecoveryDraft();
			}
			if (mutation.refresh.workspace) {
				await localContent.refresh({ force: true });
			}
			if (mutation.redirect) {
				await goto(mutation.redirect.href);
			}
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
			{#if showSaveStatus}
				<span
					class={`rounded-full border px-2.5 py-1 text-xs font-semibold ${saveStatusMeta.className}`}
				>
					{saveStatusMeta.label}
				</span>
			{/if}
		</div>
	</div>

	{#if recoveryState.kind === 'available'}
		<div class="mb-5 rounded-md border border-blue-200 bg-blue-50 p-4">
			<p class="text-sm font-medium text-blue-900">Local recovery available</p>
			<p class="mt-1 text-sm text-blue-800">
				Tentman found unsaved changes for this new item. Recover them to continue editing, or
				discard the local recovery.
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
			<p class="text-sm font-medium text-red-800">Failed to create item</p>
			<p class="mt-1 text-sm text-red-700">{currentSaveError}</p>
			<p class="mt-2 text-sm text-red-700">
				Your edits have not been discarded. You can retry from this page, and Tentman will keep a
				local recovery until a save succeeds.
			</p>
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
								scheduleRecoveryDraftWrite();
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
					<p class="text-sm font-medium text-red-800">Failed to load reusable blocks</p>
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
					configPath={discoveredConfig?.path}
					defaultAssetStoragePath={$localContent.rootConfig?.assets?.path}
					{blockConfigs}
					{blockRegistry}
					initialData={{}}
					{existingItems}
					currentItemId={undefined}
					navigationManifest={navigationManifest?.manifest}
					{groupManagementCollections}
					onaddselectoption={handleAddSelectOption}
					onchange={handleFormChange}
					ondirtystatechange={handleDirtyStateChange}
				/>
			{/if}

			<PageStickyFooter>
				<button
					type="button"
					onclick={() => void handleLocalCreate()}
					disabled={saving || !blockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Creating...' : 'Create Item'}
				</button>
				<a href={resolve(`/pages/${data.pageSlug}`)} class="tm-btn tm-btn-secondary"> Cancel </a>
			</PageStickyFooter>
		</form>
	{:else}
		<form
			bind:this={currentForm}
			method="POST"
			enctype="multipart/form-data"
			action="?/createToPreview"
			onsubmit={prepareFormSubmit}
			use:enhance={async ({ formData, cancel }) => {
				let submittedRefs: string[] = [];
				let submittedContent: ContentRecord | null = null;
				try {
					localError = null;
					const encoded = formData.get('data');
					if (typeof encoded !== 'string' || encoded.length === 0) {
						cancel();
						return;
					}

					const contentData = JSON.parse(encoded) as ContentRecord;
					submittedContent = contentData;
					const appended = await appendDraftAssetsToFormData(formData, contentData);
					submittedRefs = appended.refs;
					persistRecoveryDraft();
					saving = true;
					formHasUnsavedChanges = false;
					filenameHasUnsavedChanges = false;
				} catch (error) {
					localError =
						error instanceof Error ? error.message : 'Failed to prepare staged draft assets';
					formHasUnsavedChanges = true;
					saving = false;
					cancel();
					return;
				}

				return async ({ update, result }) => {
					if (result.type === 'redirect' || result.type === 'success') {
						const mutation = createWorkflowMutationResult({
							mode: 'github',
							intent: {
								type: 'create-item',
								slug: discoveredConfig?.slug ?? data.pageSlug
							},
							recoveryCleanup: {
								clearEditorRecovery: true,
								draftAssetRefs: submittedRefs
							},
							refresh: {
								workspace: true,
								collections: [discoveredConfig?.slug ?? data.pageSlug],
								cachePaths: submittedContent
									? getCreatedItemCacheInvalidationPaths(submittedContent)
									: []
							}
						});
						await githubRepositoryCache.invalidatePaths(mutation.refresh.cachePaths);
						await update();
						await Promise.all(
							mutation.recoveryCleanup.draftAssetRefs.map((ref) => draftAssetStore.delete(ref))
						);
						if (mutation.recoveryCleanup.clearEditorRecovery) {
							clearRecoveryDraft();
						}
					} else {
						await update();
						formHasUnsavedChanges = true;
					}
					saving = false;
				};
			}}
		>
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
								scheduleRecoveryDraftWrite();
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
					configPath={discoveredConfig?.path}
					defaultAssetStoragePath={data.rootConfig?.assets?.path}
					{blockConfigs}
					blockRegistry={githubBlockRegistry}
					initialData={{}}
					{existingItems}
					currentItemId={undefined}
					navigationManifest={navigationManifest?.manifest}
					{groupManagementCollections}
					onaddselectoption={handleAddSelectOption}
					onchange={handleFormChange}
					ondirtystatechange={handleDirtyStateChange}
				/>
			{/if}

			<PageStickyFooter>
				<button
					type="submit"
					disabled={saving || !githubBlockRegistry || !!blockRegistryError}
					class="tm-btn tm-btn-primary"
				>
					{saving ? 'Creating...' : 'Create'}
				</button>
				<a href={resolve(`/pages/${data.pageSlug}`)} class="tm-btn tm-btn-secondary"> Cancel </a>
			</PageStickyFooter>
		</form>
	{/if}
</div>
