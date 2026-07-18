<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Check from 'lucide-svelte/icons/check';
	import GitMerge from 'lucide-svelte/icons/git-merge';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import X from 'lucide-svelte/icons/x';
	import { get } from 'svelte/store';
	import { fetchContentDocument } from '$lib/content/service';
	import {
		getCollectionGroups,
		isCollectionGroupManagementEnabled
	} from '$lib/features/content-management/config';
	import {
		getOrderedCollectionNavigation,
		type OrderedCollectionNavigation
	} from '$lib/features/content-management/navigation';
	import {
		manageCollectionGroups,
		type CollectionGroupManagementMutation
	} from '$lib/features/content-management/navigation-manifest';
	import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { toasts } from '$lib/stores/toasts';
	import { createWorkflowMutationResult } from '$lib/repository/workflow-mutations';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const configEntry = $derived(
		isLocalMode
			? ($localContent.configs.find((config) => config.slug === data.pageSlug) ??
					data.discoveredConfig)
			: data.discoveredConfig
	);
	const config = $derived(configEntry?.config ?? null);
	const navigationManifest = $derived(
		isLocalMode ? $localContent.navigationManifest.manifest : data.navigationManifest.manifest
	);
	let localNavigation = $state<OrderedCollectionNavigation | null>(null);
	let busy = $state(false);
	let label = $state('');
	let value = $state('');
	let editingGroupId = $state<string | null>(null);
	let editLabel = $state('');
	let editValue = $state('');
	let deleteGroupId = $state<string | null>(null);
	let mergeSourceGroupId = $state<string | null>(null);
	let mergeTargetGroupId = $state('');

	const groups = $derived(config ? getCollectionGroups(config) : []);
	const navigation = $derived(
		isLocalMode
			? (localNavigation ?? { items: [], groups: [] })
			: (data.collectionNavigation ?? { items: [], groups: [] })
	);
	const countsByGroupId = $derived.by(() => {
		return new Map(navigation.groups.map((group) => [group.id, group.items.length]));
	});
	const ungroupedCount = $derived.by(() => {
		const groupedItemIds = new Set(
			navigation.groups.flatMap((group) => group.items.map((item) => item.itemId))
		);
		return navigation.items.filter((item) => !groupedItemIds.has(item.itemId)).length;
	});
	const mergeTargets = $derived(
		groups.filter((group) => group._tentmanId && group._tentmanId !== mergeSourceGroupId)
	);

	$effect(() => {
		if (!isLocalMode) {
			return;
		}

		if ($localContent.status === 'ready' && !configEntry) {
			void goto(resolve(`/pages/${data.pageSlug}`));
			return;
		}

		if (configEntry && !isCollectionGroupManagementEnabled(configEntry.config)) {
			void goto(resolve(`/pages/${data.pageSlug}`));
			return;
		}

		void loadLocalNavigation();
	});

	async function loadLocalNavigation() {
		const repoState = get(localRepo);
		if (!repoState.backend || !configEntry) {
			localNavigation = { items: [], groups: [] };
			return;
		}

		const content = await fetchContentDocument(
			repoState.backend,
			configEntry.config,
			configEntry.path
		);
		localNavigation = getOrderedCollectionNavigation(
			configEntry.config,
			content,
			$localContent.navigationManifest.manifest,
			$localContent.rootConfig
		);
	}

	function resetCreateForm() {
		label = '';
		value = '';
	}

	function beginEdit(group: { _tentmanId?: string; label: string; value?: string }) {
		if (!group._tentmanId) {
			return;
		}

		editingGroupId = group._tentmanId;
		editLabel = group.label;
		editValue = group.value ?? '';
	}

	function cancelEdit() {
		editingGroupId = null;
		editLabel = '';
		editValue = '';
	}

	async function applyMutation(mutation: CollectionGroupManagementMutation) {
		if (busy) {
			return;
		}

		if (!configEntry) {
			toasts.error('Collection config not found.');
			return;
		}

		busy = true;

		try {
			if (isLocalMode) {
				const repoState = get(localRepo);
				if (!repoState.backend) {
					throw new Error('No local repository is open.');
				}

				if (!configEntry) {
					throw new Error('Collection config not found.');
				}

				await manageCollectionGroups(
					repoState.backend,
					configEntry,
					mutation,
					$localContent.navigationManifest.manifest,
					{
						message: 'Update Tentman navigation manifest'
					}
				);
				const result = createWorkflowMutationResult({
					mode: 'local',
					intent: {
						type: 'manage-navigation-groups',
						slug: configEntry.slug,
						action: mutation.action
					},
					message: 'Groups updated.',
					changedPaths: ['tentman/navigation-manifest.json', configEntry.path],
					refresh: {
						workspace: true,
						navigationManifest: true,
						collections: [configEntry.slug],
						cachePaths: ['tentman/navigation-manifest.json', configEntry.path]
					}
				});
				if (result.refresh.workspace) {
					await localContent.refresh({ force: true });
				}
				await loadLocalNavigation();
			} else {
				const response = await fetch('/api/repo/navigation-manifest', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						action: 'manage-collection-groups',
						collection: data.pageSlug,
						mutation
					})
				});

				if (!response.ok) {
					throw new Error(await response.text());
				}

				const result = (await response.json()) as {
					changedPaths?: string[] | null;
				};
				const mutationResult = createWorkflowMutationResult({
					mode: 'github',
					intent: {
						type: 'manage-navigation-groups',
						slug: configEntry.slug,
						action: mutation.action
					},
					message: 'Groups updated.',
					changedPaths: result.changedPaths?.length
						? result.changedPaths
						: ['tentman/navigation-manifest.json', configEntry.path],
					refresh: {
						workspace: true,
						navigationManifest: true,
						collections: [configEntry.slug],
						cachePaths: result.changedPaths?.length
							? result.changedPaths
							: ['tentman/navigation-manifest.json', configEntry.path]
					}
				});
				await githubRepositoryCache.invalidatePaths(mutationResult.refresh.cachePaths);
				await githubRepositoryCache.warmCollection(data.pageSlug, {
					fetcher: fetch,
					force: true,
					hydrateRemaining: false,
					warmDocuments: false
				});
				await invalidate('app:content');
			}

			toasts.success('Groups updated.');
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to update groups.');
		} finally {
			busy = false;
		}
	}

	async function createGroup() {
		await applyMutation({
			action: 'create',
			label,
			value
		});
		resetCreateForm();
	}

	async function saveEdit() {
		if (!editingGroupId) {
			return;
		}

		await applyMutation({
			action: 'edit',
			groupId: editingGroupId,
			label: editLabel,
			value: editValue
		});
		cancelEdit();
	}

	async function deleteGroup() {
		if (!deleteGroupId) {
			return;
		}

		await applyMutation({
			action: 'delete',
			groupId: deleteGroupId
		});
		deleteGroupId = null;
	}

	async function mergeGroup() {
		if (!mergeSourceGroupId || !mergeTargetGroupId) {
			return;
		}

		await applyMutation({
			action: 'merge',
			sourceGroupId: mergeSourceGroupId,
			targetGroupId: mergeTargetGroupId
		});
		mergeSourceGroupId = null;
		mergeTargetGroupId = '';
	}
</script>

{#if !config}
	<p class="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-500">Loading groups...</p>
{:else}
	<div class="pb-8">
		<div class="mb-6 flex items-start justify-between gap-4">
			<div>
				<p class="text-xs font-semibold tracking-[0.16em] text-stone-500 uppercase">
					Collection groups
				</p>
				<h1 class="mt-1 text-2xl font-semibold text-stone-950">{config.label}</h1>
			</div>
			<a href={resolve(`/pages/${data.pageSlug}`)} class="tm-btn tm-btn-secondary">Done</a>
		</div>

		<section class="mb-6 border-b border-stone-200 pb-6">
			<h2 class="text-sm font-semibold text-stone-950">Create Group</h2>
			<div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
				<label class="grid gap-1 text-sm">
					<span class="font-medium text-stone-700">Label</span>
					<input
						class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
						bind:value={label}
						placeholder="Identity"
						disabled={busy}
					/>
				</label>
				<label class="grid gap-1 text-sm">
					<span class="font-medium text-stone-700">Value</span>
					<input
						class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
						bind:value
						placeholder="identity"
						disabled={busy}
					/>
				</label>
				<button
					type="button"
					class="tm-btn tm-btn-primary self-end"
					onclick={createGroup}
					disabled={busy}
				>
					<Plus class="h-4 w-4" />
					Create
				</button>
			</div>
		</section>

		<section class="grid gap-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold text-stone-950">Groups</h2>
				<p class="text-sm text-stone-500">{ungroupedCount} ungrouped</p>
			</div>

			{#if groups.length === 0}
				<p
					class="rounded-md border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500"
				>
					No groups configured.
				</p>
			{/if}

			{#each groups as group (group._tentmanId ?? group.value)}
				<section class="rounded-md border border-stone-200 p-4">
					{#if editingGroupId === group._tentmanId}
						<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
							<label class="grid gap-1 text-sm">
								<span class="font-medium text-stone-700">Label</span>
								<input
									class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
									bind:value={editLabel}
									disabled={busy}
								/>
							</label>
							<label class="grid gap-1 text-sm">
								<span class="font-medium text-stone-700">Value</span>
								<input
									class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
									bind:value={editValue}
									disabled={busy}
								/>
							</label>
							<button
								type="button"
								class="tm-btn tm-btn-primary self-end"
								onclick={saveEdit}
								disabled={busy}
							>
								<Check class="h-4 w-4" />
								Save
							</button>
							<button
								type="button"
								class="tm-btn tm-btn-secondary self-end"
								onclick={cancelEdit}
								disabled={busy}
							>
								<X class="h-4 w-4" />
								Cancel
							</button>
						</div>
					{:else}
						<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
							<div class="min-w-0">
								<h3 class="truncate font-semibold text-stone-950">{group.label}</h3>
								<p class="mt-1 text-sm text-stone-500">
									{group.value ?? 'No value'} · {countsByGroupId.get(group._tentmanId ?? '') ?? 0}
									items
								</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									class="tm-btn tm-btn-secondary min-h-8 px-2 text-xs"
									onclick={() => beginEdit(group)}
									disabled={busy || !group._tentmanId}
								>
									<Pencil class="h-3.5 w-3.5" />
									Edit
								</button>
								<button
									type="button"
									class="tm-btn tm-btn-secondary min-h-8 px-2 text-xs"
									onclick={() => {
										mergeSourceGroupId = group._tentmanId ?? null;
										mergeTargetGroupId = '';
									}}
									disabled={busy || !group._tentmanId || groups.length < 2}
								>
									<GitMerge class="h-3.5 w-3.5" />
									Merge
								</button>
								<button
									type="button"
									class="tm-btn tm-btn-secondary min-h-8 px-2 text-xs text-red-700"
									onclick={() => (deleteGroupId = group._tentmanId ?? null)}
									disabled={busy || !group._tentmanId}
								>
									<Trash2 class="h-3.5 w-3.5" />
									Delete
								</button>
							</div>
						</div>
					{/if}

					{#if deleteGroupId === group._tentmanId}
						<div class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
							<p>Delete {group.label} and move its items to Ungrouped?</p>
							<div class="mt-3 flex gap-2">
								<button
									type="button"
									class="tm-btn tm-btn-primary min-h-8 px-2 text-xs"
									onclick={deleteGroup}
									disabled={busy}
								>
									Delete
								</button>
								<button
									type="button"
									class="tm-btn tm-btn-secondary min-h-8 px-2 text-xs"
									onclick={() => (deleteGroupId = null)}
									disabled={busy}
								>
									Cancel
								</button>
							</div>
						</div>
					{/if}

					{#if mergeSourceGroupId === group._tentmanId}
						<div
							class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
						>
							<label class="grid gap-1">
								<span class="font-medium">Merge {group.label} into</span>
								<select
									class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
									bind:value={mergeTargetGroupId}
									disabled={busy}
								>
									<option value="">Choose target group</option>
									{#each mergeTargets as target (target._tentmanId)}
										<option value={target._tentmanId}>{target.label}</option>
									{/each}
								</select>
							</label>
							<div class="mt-3 flex gap-2">
								<button
									type="button"
									class="tm-btn tm-btn-primary min-h-8 px-2 text-xs"
									onclick={mergeGroup}
									disabled={busy || !mergeTargetGroupId}
								>
									Merge
								</button>
								<button
									type="button"
									class="tm-btn tm-btn-secondary min-h-8 px-2 text-xs"
									onclick={() => {
										mergeSourceGroupId = null;
										mergeTargetGroupId = '';
									}}
									disabled={busy}
								>
									Cancel
								</button>
							</div>
						</div>
					{/if}
				</section>
			{/each}
		</section>
	</div>
{/if}
