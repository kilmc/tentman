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
	import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import { get } from 'svelte/store';
	import { getCardFields } from '$lib/features/forms/helpers';
	import { getConfigItemLabel } from '$lib/features/content-management/navigation';
	import {
		getStateBadgeClassName,
		resolveCollectionItemState
	} from '$lib/features/content-management/state';
	import { appendDraftAssetsToFormData } from '$lib/features/draft-assets/client';
	import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import {
		findContentItemByRoute,
		formatContentValue
	} from '$lib/features/content-management/item';
	import { buildCollectionFilePath } from '$lib/features/content-management/transforms';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { toasts } from '$lib/stores/toasts';
	import {
		deleteContentDocument,
		fetchContentDocument,
		saveContentDocument
	} from '$lib/content/service';
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
	import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
	import {
		detectCollectionGroupField,
		manageCollectionGroups,
		syncCollectionItemGroupSelection,
		syncCollectionItemGroupSelectionInManifest
	} from '$lib/features/content-management/navigation-manifest';
	import {
		getCollectionConfigReferences,
		isCollectionManifestBacked
	} from '$lib/features/content-management/config';
	import { buildContentTitleContext, formatAppTitle } from '$lib/utils/page-title';
	import { resolveConfigPath } from '$lib/utils/validation';
	import { markWorkflowReadiness } from '$lib/utils/workflow-instrumentation';
	import { createLocalWorkflowItemViewData } from '$lib/repository/local-workflow-data';
	import type { WorkflowItemViewData } from '$lib/repository/workflow-data';

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

	function getInitialItem() {
		return data.item;
	}

	function getInitialContentError() {
		return data.contentError;
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

	function getInitialWorkflowData() {
		return data.workflowData ?? null;
	}

	let discoveredConfig = $state(getInitialDiscoveredConfig());
	let blockConfigs = $state(getInitialBlockConfigs());
	let packageBlocks = $state<SerializablePackageBlock[]>(getInitialPackageBlocks());
	let blockRegistry = $state<BlockRegistry | null>(null);
	let item = $state(getInitialItem());
	let routeWorkflowData = $state<WorkflowItemViewData | null>(getInitialWorkflowData());
	let existingItems = $state<ContentRecord[]>(getInitialExistingItems());
	let contentError = $state(getInitialContentError());
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let actionMenu = $state<HTMLDetailsElement | null>(null);
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);
	let blockRegistryError = $state<string | null>(getInitialBlockRegistryError());
	let navigationManifest = $state<NavigationManifestState | null>(getInitialNavigationManifest());
	let localError = $state<string | null>(null);
	let localLoadRequest = 0;
	let recoveryState = $state<EditorRecoveryState>({ kind: 'none' });
	let recoveryWriteTimer = $state<number | null>(null);
	const flashMessageKeys = ['saved', 'published', 'branch'] as const;

	const config = $derived(discoveredConfig?.config ?? null);
	const groupManagementCollections = $derived(
		discoveredConfig
			? getCollectionConfigReferences({
					...discoveredConfig.config,
					slug: discoveredConfig.slug
				})
			: []
	);
	const cardFields = $derived(config ? getCardFields(config) : { primary: [], secondary: [] });
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
	const resolvedItemState = $derived.by(() => {
		if (!config || !item) {
			return null;
		}

		return resolveCollectionItemState(
			config,
			item as ContentRecord,
			isLocalMode ? $localContent.rootConfig : (data.rootConfig ?? null)
		);
	});
	const siteName = $derived.by(() =>
		isLocalMode
			? ($localContent.rootConfig?.siteName ?? data.selectedBackend?.repo.name ?? 'Tentman')
			: (data.rootConfig?.siteName ?? data.selectedRepo?.name ?? 'Tentman')
	);
	const documentTitle = $derived.by(() => {
		if (!config) {
			return formatAppTitle(`Edit ${data.itemId}`, siteName);
		}

		return formatAppTitle(
			buildContentTitleContext({
				kind: 'edit-item',
				config,
				item: (item as ContentRecord | null) ?? null
			}),
			siteName
		);
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
		item = data.item;
		routeWorkflowData = data.workflowData ?? null;
		existingItems = data.existingItems ?? [];
		contentError = data.contentError;
		blockRegistryError = data.blockRegistryError ?? null;
		navigationManifest = data.navigationManifest ?? null;
		hasUnsavedChanges = false;
		localError = null;
	}

	registerUnsavedChangesGuard({
		hasUnsavedChanges: () => hasUnsavedChanges,
		isSaving: () => saving || deleting
	});

	onMount(() => {
		markWorkflowReadiness({
			workflow: 'rich-editor-interactive',
			mark: 'ready',
			route: `/pages/${data.pageSlug}/${data.itemId}/edit`,
			slug: data.pageSlug,
			itemId: data.itemId
		});
		handleUrlMessages();

		const cleanup = registerKeyboardShortcuts([
			{ key: 's', meta: true, ctrl: true, callback: () => currentForm?.requestSubmit() },
			{ key: 'Escape', callback: () => window.history.back() }
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

	async function loadLocalItem(pageSlug: string, itemId: string) {
		const requestId = ++localLoadRequest;

		discoveredConfig = null;
		blockConfigs = [];
		packageBlocks = [];
		blockRegistry = null;
		item = null;
		routeWorkflowData = null;
		existingItems = [];
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
		navigationManifest = contentState.navigationManifest;
		hasUnsavedChanges = false;
		if (!repoState.backend || !discoveredConfig) {
			contentError = 'Configuration not found';
			if (repoState.backend) {
				routeWorkflowData = createLocalWorkflowItemViewData({
					backend: repoState.backend,
					discoverySignature: contentState.discoverySignature ?? null,
					slug: pageSlug,
					itemId,
					discoveredConfig,
					item: null,
					navigationManifest: contentState.navigationManifest,
					blockConfigs: contentState.blockConfigs,
					blockRegistryError: contentState.blockRegistryError,
					contentError
				});
			}
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
				existingItems = loadedContent;
				const localItem =
					findContentItemByRoute(loadedContent, discoveredConfig.config, itemId) ?? null;
				routeWorkflowData = createLocalWorkflowItemViewData({
					backend: repoState.backend,
					discoverySignature: contentState.discoverySignature ?? null,
					slug: pageSlug,
					itemId,
					discoveredConfig,
					item: localItem,
					navigationManifest: contentState.navigationManifest,
					blockConfigs: contentState.blockConfigs,
					blockRegistryError: contentState.blockRegistryError,
					contentError: null
				});
				item = routeWorkflowData.item;
			} else {
				routeWorkflowData = createLocalWorkflowItemViewData({
					backend: repoState.backend,
					discoverySignature: contentState.discoverySignature ?? null,
					slug: pageSlug,
					itemId,
					discoveredConfig,
					item: null,
					navigationManifest: contentState.navigationManifest,
					blockConfigs: contentState.blockConfigs,
					blockRegistryError: contentState.blockRegistryError,
					contentError: null
				});
			}
		} catch (error) {
			if (requestId !== localLoadRequest) {
				return;
			}

			contentError = error instanceof Error ? error.message : 'Failed to load content';
			routeWorkflowData = createLocalWorkflowItemViewData({
				backend: repoState.backend,
				discoverySignature: contentState.discoverySignature ?? null,
				slug: pageSlug,
				itemId,
				discoveredConfig,
				item: null,
				navigationManifest: contentState.navigationManifest,
				blockConfigs: contentState.blockConfigs,
				blockRegistryError: contentState.blockRegistryError,
				contentError
			});
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
			draftBranchStore.setBranch(result.branchName, data.selectedRepo.full_name);
		}
	}

	$effect(() => {
		if (!data.branch || !data.selectedRepo || isLocalMode) {
			return;
		}

		const repoFullName = `${data.selectedRepo.owner}/${data.selectedRepo.name}`;
		draftBranchStore.setBranch(data.branch, repoFullName);
	});

	$effect(() => {
		if (item === null || hasUnsavedChanges || saving || typeof localStorage === 'undefined') {
			return;
		}

		recoveryState = resolveEditorRecoveryState({
			storage: localStorage,
			routeKey: recoveryRouteKey,
			contextKey: recoveryContextKey,
			baselineFingerprint: getContentFingerprint(item)
		});
	});

	function persistRecoveryDraft() {
		if (
			!formGenerator ||
			!hasUnsavedChanges ||
			item === null ||
			typeof localStorage === 'undefined'
		) {
			return;
		}

		writeEditorRecoverySnapshot(
			localStorage,
			createEditorRecoverySnapshot({
				routeKey: recoveryRouteKey,
				contextKey: recoveryContextKey,
				baselineFingerprint: getContentFingerprint(item),
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

	function canSaveCurrentItemUpdateNavigationManifest(): boolean {
		if (
			!discoveredConfig?.config._tentmanId ||
			!isCollectionManifestBacked(discoveredConfig.config)
		) {
			return false;
		}

		try {
			detectCollectionGroupField(discoveredConfig);
			return true;
		} catch {
			return false;
		}
	}

	function getUpdatedNavigationManifestForSavedItem(nextContent: ContentRecord) {
		if (!discoveredConfig || !canSaveCurrentItemUpdateNavigationManifest()) {
			return undefined;
		}

		const baseManifest = navigationManifest?.manifest ?? null;
		const nextManifest = syncCollectionItemGroupSelectionInManifest(
			discoveredConfig,
			nextContent,
			baseManifest
		);

		return JSON.stringify(baseManifest ?? null) === JSON.stringify(nextManifest ?? null)
			? undefined
			: nextManifest;
	}

	function getCurrentItemContentCachePath(): string[] {
		if (!discoveredConfig) {
			return [];
		}

		const contentPath = resolveConfigPath(
			discoveredConfig.path,
			discoveredConfig.config.content.path
		);
		const itemPath =
			discoveredConfig.config.content.mode === 'directory'
				? typeof item?._filename === 'string'
					? buildCollectionFilePath(contentPath, item._filename)
					: null
				: contentPath;

		return itemPath ? [itemPath] : [];
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
			await syncCollectionItemGroupSelection(
				repoState.backend,
				discoveredConfig,
				materialized.content,
				navigationManifest?.manifest,
				{
					message: 'Update Tentman navigation manifest'
				}
			);
			await Promise.all(materialized.cleanedRefs.map((ref) => draftAssetStore.delete(ref)));
			clearRecoveryDraft();
			await localContent.refresh({ force: true });

			await goto(
				resolve(`/pages/${discoveredConfig.slug}/${data.itemId}/edit`) + '?published=true'
			);
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

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>

<div class="min-w-0">
	<div class="mb-5">
		<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">
						{getItemTitle()}
					</h1>
					{#if resolvedItemState && resolvedItemState.visibility.header !== false}
						<span
							class={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${getStateBadgeClassName(resolvedItemState.variant)}`}
						>
							{resolvedItemState.label}
						</span>
					{/if}
					{#if showSaveStatus}
						<span
							class={`rounded-full border px-2.5 py-1 text-xs font-semibold ${saveStatusMeta.className}`}
						>
							{saveStatusMeta.label}
						</span>
					{/if}
				</div>
				{#if config}
					<p class="mt-1 text-sm text-stone-500">{getConfigItemLabel(config)}</p>
				{/if}
			</div>
			{#if config}
				<details bind:this={actionMenu} class="relative justify-self-start sm:justify-self-end">
					<summary class="tm-icon-btn list-none" aria-label={`${getItemTitle()} actions`}>
						<MoreHorizontal class="h-4 w-4" />
					</summary>
					<div
						class="absolute top-full right-0 z-20 mt-2 grid min-w-44 gap-1 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
					>
						<button
							type="button"
							onclick={() => {
								actionMenu?.removeAttribute('open');
								showDeleteConfirm = true;
							}}
							class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
							aria-label={`Delete ${getItemTitle()}`}
						>
							<Trash2 class="h-4 w-4" />
							<span>Delete {getConfigItemLabel(config)}</span>
						</button>
					</div>
				</details>
			{/if}
		</div>
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

	{#if recoveryState.kind === 'available'}
		<div class="mb-5 rounded-md border border-blue-200 bg-blue-50 p-4">
			<p class="text-sm font-medium text-blue-900">Local recovery available</p>
			<p class="mt-1 text-sm text-blue-800">
				Tentman found unsaved changes for this item. Recover them to continue editing, or discard
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
					<p class="text-sm font-medium text-red-800">Failed to load reusable blocks</p>
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
						configPath={discoveredConfig?.path}
						defaultAssetStoragePath={$localContent.rootConfig?.assets?.path}
						{blockConfigs}
						{blockRegistry}
						initialData={item}
						{existingItems}
						currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
						navigationManifest={navigationManifest?.manifest}
						{groupManagementCollections}
						onaddselectoption={handleAddSelectOption}
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
					if (result.type === 'redirect' || result.type === 'success') {
						const nextNavigationManifest = submittedContent
							? getUpdatedNavigationManifestForSavedItem(submittedContent)
							: undefined;
						if (discoveredConfig && submittedContent) {
							await githubRepositoryCache.patchCollectionItemFromContent({
								slug: discoveredConfig.slug,
								itemId: data.itemId,
								content: submittedContent,
								...(nextNavigationManifest !== undefined
									? { navigationManifest: nextNavigationManifest }
									: {})
							});
						}
						await update();
						await Promise.all(submittedRefs.map((ref) => draftAssetStore.delete(ref)));
						clearRecoveryDraft();
					} else {
						await update();
						hasUnsavedChanges = true;
					}
					saving = false;
				};
			}}
		>
			<input type="hidden" name="data" value="" />
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
						configPath={discoveredConfig?.path}
						defaultAssetStoragePath={data.rootConfig?.assets?.path}
						{blockConfigs}
						blockRegistry={githubBlockRegistry}
						initialData={item}
						{existingItems}
						currentItemId={config.idField ? String(item?.[config.idField]) : undefined}
						navigationManifest={navigationManifest?.manifest}
						{groupManagementCollections}
						onaddselectoption={handleAddSelectOption}
						onchange={handleFormChange}
						ondirtystatechange={handleDirtyStateChange}
					/>
				{/key}
			{/if}
			<PageStickyFooter>
				<button type="submit" disabled={!canSaveChanges} class="tm-btn tm-btn-primary">
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
			</PageStickyFooter>
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
							return async ({ update, result }) => {
								if (result.type === 'redirect' || result.type === 'success') {
									await githubRepositoryCache.invalidatePaths(getCurrentItemContentCachePath());
								}
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
</div>
