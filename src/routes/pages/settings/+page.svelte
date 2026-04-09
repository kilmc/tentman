<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { get } from 'svelte/store';
	import type { PageData } from './$types';
	import {
		buildNavigationManifestFromRepository,
		getManualNavigationSetupState,
		writeMissingContentConfigIds,
		writeNavigationManifest
	} from '$lib/features/content-management/navigation-manifest';
	import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';

	let { data }: { data: PageData } = $props();

	const CONFIG_ID_COMMIT_MESSAGE = 'Add Tentman content config ids';
	const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const manifestState = $derived(
		isLocalMode ? $localContent.navigationManifest : data.navigationManifest
	);
	const configs = $derived(
		orderDiscoveredConfigs(
			isLocalMode ? $localContent.configs : data.configs,
			manifestState.manifest
		)
	);
	const setup = $derived(getManualNavigationSetupState(configs, manifestState));

	let saving = $state(false);
	let actionError = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);

	async function refreshAfterMutation(message: string) {
		actionMessage = message;
		actionError = null;

		if (isLocalMode) {
			await localContent.refresh({ force: true });
		}

		await invalidateAll();
	}

	async function handleEnableManualNavigation() {
		saving = true;
		actionError = null;
		actionMessage = null;

		try {
			if (isLocalMode) {
				const repoState = get(localRepo);
				if (!repoState.backend) {
					throw new Error('No local repository is open.');
				}

				await writeMissingContentConfigIds(repoState.backend, configs, {
					message: CONFIG_ID_COMMIT_MESSAGE
				});
				await localContent.refresh({ force: true });
				const manifest = await buildNavigationManifestFromRepository(
					repoState.backend,
					get(localContent).configs
				);
				await writeNavigationManifest(repoState.backend, manifest, {
					message: MANIFEST_COMMIT_MESSAGE
				});
				await refreshAfterMutation('Manual navigation is ready.');
				return;
			}

			const response = await fetch('/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'enable'
				})
			});

			if (!response.ok) {
				throw new Error('Failed to enable manual navigation');
			}

			await refreshAfterMutation('Manual navigation is ready.');
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to enable manual navigation';
		} finally {
			saving = false;
		}
	}

	async function handleAddMissingIds() {
		saving = true;
		actionError = null;
		actionMessage = null;

		try {
			if (isLocalMode) {
				const repoState = get(localRepo);
				if (!repoState.backend) {
					throw new Error('No local repository is open.');
				}

				await writeMissingContentConfigIds(repoState.backend, configs, {
					message: CONFIG_ID_COMMIT_MESSAGE
				});
				await refreshAfterMutation('Added missing content config ids.');
				return;
			}

			const response = await fetch('/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'add-missing-config-ids'
				})
			});

			if (!response.ok) {
				throw new Error('Failed to add missing content config ids');
			}

			await refreshAfterMutation('Added missing content config ids.');
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : 'Failed to add missing content config ids';
		} finally {
			saving = false;
		}
	}
</script>

<div class="container mx-auto max-w-4xl p-4 sm:p-6">
	<div class="mb-8">
		<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">Site Settings</p>
		<h1 class="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">Navigation</h1>
		<p class="mt-3 max-w-2xl text-sm text-gray-600">
			Set up the repo manifest that powers sidebar editing. Once it is ready, use
			<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">Edit navigation</code>
			in the sidebar.
		</p>
	</div>

	{#if actionError}
		<div class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
			{actionError}
		</div>
	{/if}

	{#if actionMessage}
		<div class="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
			{actionMessage}
		</div>
	{/if}

	<div class="space-y-6">
		<section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">Status</p>
					<h2 class="mt-2 text-xl font-semibold text-gray-900">
						{setup.status === 'active'
							? 'Ready'
							: setup.status === 'partial'
								? 'Needs setup'
								: 'Not enabled'}
					</h2>
					<p class="mt-2 text-sm text-gray-600">
						Manifest path:
						<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">{setup.manifestPath}</code>
					</p>
				</div>

				{#if !setup.manifestExists || !setup.manifestValid}
					<button
						type="button"
						class="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
						onclick={() => void handleEnableManualNavigation()}
						disabled={saving}
					>
						{setup.manifestExists ? 'Regenerate manifest' : 'Enable manual navigation'}
					</button>
				{/if}
			</div>

			<div class="mt-6 grid gap-4 md:grid-cols-2">
				<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
					<p class="font-medium text-gray-900">Manifest</p>
					<p class="mt-2 text-sm text-gray-600">
						{#if setup.manifestExists && setup.manifestValid}
							The sidebar editor is using the repo manifest.
						{:else if setup.manifestExists}
							The manifest exists, but Tentman could not parse it.
						{:else}
							Generate the manifest to unlock sidebar editing.
						{/if}
					</p>
					{#if setup.manifestError}
						<p class="mt-2 text-sm text-red-700">{setup.manifestError}</p>
					{/if}
				</div>

				<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
					<p class="font-medium text-gray-900">Sidebar editing</p>
					<p class="mt-2 text-sm text-gray-600">
						Top-level order needs config
						<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">id</code>
						values. Collection item order also needs an
						<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">idField</code>.
					</p>
				</div>
			</div>
		</section>

		<section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
						Content Config Ids
					</p>
					<p class="mt-2 text-sm text-gray-600">
						These are required for stable top-level navigation order.
					</p>
				</div>

				{#if setup.missingConfigIds.length > 0}
					<button
						type="button"
						class="inline-flex rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
						onclick={() => void handleAddMissingIds()}
						disabled={saving}
					>
						Add missing ids
					</button>
				{/if}
			</div>

			{#if setup.missingConfigIds.length === 0}
				<p class="mt-4 text-sm text-green-700">All top-level content configs already have ids.</p>
			{:else}
				<div class="mt-4 space-y-2">
					{#each setup.missingConfigIds as config (config.path)}
						<div
							class="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"
						>
							<span class="font-medium">{config.label}</span>
							<span>
								will get
								<code class="rounded bg-yellow-100 px-1 py-0.5 text-xs">{config.suggestedId}</code>
								in
								<code class="rounded bg-yellow-100 px-1 py-0.5 text-xs">{config.path}</code>.
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
			<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
				Collection Readiness
			</p>
			<div class="mt-4 space-y-2">
				{#each setup.collections as collection (collection.slug)}
					<div
						class="rounded-xl border border-gray-200 p-3"
						class:bg-white={collection.canOrderItems}
						class:bg-gray-50={!collection.canOrderItems}
					>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="font-medium text-gray-900">{collection.label}</p>
							<p
								class:text-green-700={collection.canOrderItems}
								class:text-gray-500={!collection.canOrderItems}
								class="text-sm font-medium"
							>
								{collection.canOrderItems ? 'Editable in sidebar' : 'Locked in sidebar'}
							</p>
						</div>
						{#if !collection.canOrderItems}
							<p class="mt-1 text-sm text-gray-500">
								Add a config
								<code class="rounded bg-gray-200 px-1 py-0.5 text-xs">id</code>
								and
								<code class="rounded bg-gray-200 px-1 py-0.5 text-xs">idField</code>
								to unlock item reordering.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
