<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
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
	import { localPreviewUrl } from '$lib/stores/local-preview-url';
	import { localRepo } from '$lib/stores/local-repo';
	import {
		buildLocalPreviewUrlFromPort,
		getPreviewPortFromUrl,
		writeLocalPreviewUrl
	} from '$lib/config/root-config-editor';

	let { data }: { data: PageData } = $props();

	const CONFIG_ID_COMMIT_MESSAGE = 'Add Tentman content config ids';
	const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';
	const LOCAL_PREVIEW_COMMIT_MESSAGE = 'Update Tentman local preview URL';

	let saving = $state(false);
	let savingPreviewPort = $state(false);
	let actionError = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);
	let previewPortInput = $state('');
	let previewPortSource = $state<string | null>(null);

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
	const rootConfig = $derived(isLocalMode ? $localContent.rootConfig : data.rootConfig);
	const currentPreviewUrl = $derived(rootConfig?.local?.previewUrl ?? null);
	const previewPortChanged = $derived(
		previewPortInput.trim() !== getPreviewPortFromUrl(currentPreviewUrl)
	);

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

	async function handleSavePreviewPort() {
		if (!isLocalMode || savingPreviewPort) {
			return;
		}

		savingPreviewPort = true;
		actionError = null;
		actionMessage = null;

		try {
			const repoState = get(localRepo);
			if (!repoState.backend) {
				throw new Error('No local repository is open.');
			}

			const previewUrl = buildLocalPreviewUrlFromPort(previewPortInput, currentPreviewUrl);
			if (new URL(previewUrl).origin === page.url.origin) {
				throw new Error('Use the site preview port, not the Tentman app port.');
			}

			await writeLocalPreviewUrl(repoState.backend, previewUrl, {
				message: LOCAL_PREVIEW_COMMIT_MESSAGE
			});
			previewPortInput = getPreviewPortFromUrl(previewUrl);
			previewPortSource = previewUrl;
			localPreviewUrl.set(previewUrl);
			await refreshAfterMutation('Local preview port updated.');
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to update local preview port';
		} finally {
			savingPreviewPort = false;
		}
	}

	$effect(() => {
		if (savingPreviewPort || currentPreviewUrl === previewPortSource) {
			return;
		}

		previewPortInput = getPreviewPortFromUrl(currentPreviewUrl);
		previewPortSource = currentPreviewUrl;
	});
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<h1 class="text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">Settings</h1>
		<p class="mt-2 max-w-2xl text-sm text-stone-600">
			Set up the repo manifest that powers sidebar editing. Once it is ready, use
			<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">Edit navigation</code>
			in the sidebar.
		</p>
	</div>

	{#if actionError}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
			{actionError}
		</div>
	{/if}

	{#if actionMessage}
		<div class="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
			{actionMessage}
		</div>
	{/if}

	<div class="space-y-4">
		{#if isLocalMode}
			<section class="rounded-md border border-stone-200 bg-white p-4">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 class="text-base font-semibold text-stone-950">Local preview</h2>
						<p class="mt-2 text-sm text-stone-600">
							Preview URL:
							<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">
								{currentPreviewUrl ?? 'Not set'}
							</code>
						</p>
						{#if !currentPreviewUrl}
							<p class="mt-2 text-sm text-yellow-800">
								Absolute image paths like <code class="rounded bg-yellow-100 px-1 py-0.5 text-xs"
									>/images/example.jpg</code
								>
								need a local preview port before they can render inside Tentman.
							</p>
						{/if}
						<p class="mt-2 text-xs text-stone-500">
							Use the site server port, not Tentman's current port
							<code class="rounded bg-stone-100 px-1 py-0.5">{page.url.port}</code>.
						</p>
					</div>
				</div>

				<form
					class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
					onsubmit={(event) => {
						event.preventDefault();
						void handleSavePreviewPort();
					}}
				>
					<label class="grid gap-1.5">
						<span class="text-sm font-medium text-stone-700">Preview port</span>
						<input
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							bind:value={previewPortInput}
							class="min-h-10 rounded-md border border-stone-300 px-3 text-sm focus:border-stone-950 focus:ring-1 focus:ring-stone-950 focus:outline-none"
							placeholder="5173"
						/>
					</label>

					<button
						type="submit"
						class="inline-flex min-h-10 items-center justify-center self-end rounded-md bg-stone-950 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
						disabled={savingPreviewPort || !previewPortChanged}
					>
						{savingPreviewPort ? 'Saving...' : 'Save port'}
					</button>
				</form>
			</section>
		{/if}

		<section class="rounded-md border border-stone-200 bg-white p-4">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-xl font-semibold text-stone-950">
						{setup.status === 'active'
							? 'Ready'
							: setup.status === 'partial'
								? 'Needs setup'
								: 'Not enabled'}
					</h2>
					<p class="mt-2 text-sm text-stone-600">
						Manifest path:
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">{setup.manifestPath}</code>
					</p>
				</div>

				{#if !setup.manifestExists || !setup.manifestValid}
					<button
						type="button"
						class="inline-flex rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
						onclick={() => void handleEnableManualNavigation()}
						disabled={saving}
					>
						{setup.manifestExists ? 'Regenerate manifest' : 'Enable manual navigation'}
					</button>
				{/if}
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-2">
				<div class="rounded-md border border-stone-200 bg-stone-50 p-3">
					<p class="font-medium text-stone-950">Manifest</p>
					<p class="mt-2 text-sm text-stone-600">
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

				<div class="rounded-md border border-stone-200 bg-stone-50 p-3">
					<p class="font-medium text-stone-950">Sidebar editing</p>
					<p class="mt-2 text-sm text-stone-600">
						Top-level order needs config
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">id</code>
						values. Collection item order also needs an
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">idField</code>.
					</p>
				</div>
			</div>
		</section>

		<section class="rounded-md border border-stone-200 bg-white p-4">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-base font-semibold text-stone-950">Content config IDs</h2>
					<p class="mt-2 text-sm text-stone-600">
						These are required for stable top-level navigation order.
					</p>
				</div>

				{#if setup.missingConfigIds.length > 0}
					<button
						type="button"
						class="inline-flex rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
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
							class="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"
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

		<section class="rounded-md border border-stone-200 bg-white p-4">
			<h2 class="text-base font-semibold text-stone-950">Collection readiness</h2>
			<div class="mt-3 space-y-2">
				{#each setup.collections as collection (collection.slug)}
					<div
						class="rounded-md border border-stone-200 p-3"
						class:bg-white={collection.canOrderItems}
						class:bg-stone-50={!collection.canOrderItems}
					>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="font-medium text-stone-950">{collection.label}</p>
							<p
								class:text-green-700={collection.canOrderItems}
								class:text-stone-500={!collection.canOrderItems}
								class="text-sm font-medium"
							>
								{collection.canOrderItems ? 'Editable in sidebar' : 'Locked in sidebar'}
							</p>
						</div>
						{#if !collection.canOrderItems}
							<p class="mt-1 text-sm text-stone-500">
								Add a config
								<code class="rounded bg-stone-200 px-1 py-0.5 text-xs">id</code>
								and
								<code class="rounded bg-stone-200 px-1 py-0.5 text-xs">idField</code>
								to unlock item reordering.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
