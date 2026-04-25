<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import type { PageData } from './$types';
	import {
		getManualNavigationSetupState,
		reconcileManualNavigationSetup,
		writeMissingContentConfigIds,
		writeNavigationManifest
	} from '$lib/features/content-management/navigation-manifest';
	import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
	import { localContent } from '$lib/stores/local-content';
	import { draftBranch } from '$lib/stores/draft-branch';
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
	const rootConfig = $derived(isLocalMode ? $localContent.rootConfig : data.rootConfig);
	const configs = $derived(
		orderDiscoveredConfigs(
			isLocalMode ? $localContent.configs : data.configs,
			manifestState.manifest,
			rootConfig
		)
	);
	const setup = $derived(getManualNavigationSetupState(configs, manifestState, rootConfig));
	const currentPreviewUrl = $derived(rootConfig?.local?.previewUrl ?? null);
	const previewPortChanged = $derived(
		previewPortInput.trim() !== getPreviewPortFromUrl(currentPreviewUrl)
	);
	const hasConfiguredManualNavigation = $derived(
		setup.topLevelManualSortingEnabled ||
			setup.collections.some((collection) => collection.manualSortingEnabled)
	);

	async function refreshAfterMutation(message: string) {
		actionMessage = message;
		actionError = null;

		if (isLocalMode) {
			await localContent.refresh({ force: true });
		}

		await invalidateAll();
	}

	async function handleRepairNavigationState() {
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
				const manifest = await reconcileManualNavigationSetup(
					repoState.backend,
					get(localContent).configs,
					get(localContent).rootConfig,
					get(localContent).navigationManifest.manifest,
					{
						message: CONFIG_ID_COMMIT_MESSAGE
					}
				);
				await writeNavigationManifest(repoState.backend, manifest, {
					message: MANIFEST_COMMIT_MESSAGE
				});
				await refreshAfterMutation('Navigation state repaired.');
				return;
			}

			const response = await fetch('/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'repair',
					branchName: get(draftBranch).branchName
				})
			});

			if (!response.ok) {
				throw new Error('Failed to repair navigation state');
			}

			const result = (await response.json()) as {
				branchName?: string | null;
			};
			if (result.branchName && data.selectedRepo) {
				draftBranch.setBranch(
					result.branchName,
					`${data.selectedRepo.owner}/${data.selectedRepo.name}`
				);
			}

			await refreshAfterMutation(
				result.branchName
					? `Navigation state staged in ${result.branchName}.`
					: 'Navigation state repaired.'
			);
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to repair navigation state';
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
					action: 'add-missing-config-ids',
					branchName: get(draftBranch).branchName
				})
			});

			if (!response.ok) {
				throw new Error('Failed to add missing content config ids');
			}

			const result = (await response.json()) as {
				branchName?: string | null;
			};
			if (result.branchName && data.selectedRepo) {
				draftBranch.setBranch(
					result.branchName,
					`${data.selectedRepo.owner}/${data.selectedRepo.name}`
				);
			}

			await refreshAfterMutation(
				result.branchName
					? `Tentman ids staged in ${result.branchName}.`
					: 'Added missing content config ids.'
			);
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
			Inspect and repair the repo state that powers sidebar and collection panel editing. Tentman manages stable
			<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">_tentmanId</code>
			values for manual ordering automatically at runtime, and this screen is for syncing that
			state back into the repo when needed. Once it is ready, use
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
						{!hasConfiguredManualNavigation
							? 'Configured off'
							: setup.status === 'active'
							? 'Ready'
							: setup.status === 'partial'
								? 'Needs repair'
								: 'Needs repair'}
					</h2>
					<p class="mt-2 text-sm text-stone-600">
						Manifest path:
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">{setup.manifestPath}</code>
					</p>
				</div>

				{#if hasConfiguredManualNavigation && (!setup.manifestExists || !setup.manifestValid || setup.missingConfigIds.length > 0)}
					<button
						type="button"
						class="inline-flex rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
						onclick={() => void handleRepairNavigationState()}
						disabled={saving}
					>
						{!setup.manifestExists
							? 'Generate manifest'
							: setup.missingConfigIds.length > 0
								? 'Sync navigation ids'
								: 'Repair navigation state'}
					</button>
				{/if}
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-2">
				<div class="rounded-md border border-stone-200 bg-stone-50 p-3">
					<p class="font-medium text-stone-950">Manifest</p>
					<p class="mt-2 text-sm text-stone-600">
						{#if !hasConfiguredManualNavigation}
							This repo has not opted into manual navigation in its config.
						{:else if setup.manifestExists && setup.manifestValid}
							The sidebar and collection panel are using the repo manifest.
						{:else if setup.manifestExists}
							The manifest exists, but Tentman could not parse it.
						{:else}
							Generate the manifest to unlock sidebar and collection panel editing.
						{/if}
					</p>
					{#if setup.manifestError}
						<p class="mt-2 text-sm text-red-700">{setup.manifestError}</p>
					{/if}
				</div>

				<div class="rounded-md border border-stone-200 bg-stone-50 p-3">
					<p class="font-medium text-stone-950">Sidebar and collection panel editing</p>
					<p class="mt-2 text-sm text-stone-600">
						Top-level order is opted into with root
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">content.sorting: "manual"</code>
						. Collection item order is opted into with
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">collection.sorting: "manual"</code>
						plus an author-facing
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">idField</code>.
					</p>
					<p class="mt-2 text-sm text-stone-600">
						When a repo is configured that way, Tentman can repair missing stable ids, fix
						duplicates, migrate legacy group definitions into
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">collection.groups</code>,
						and refresh legacy manifest references without exposing those ids in normal authoring.
					</p>
				</div>
			</div>
		</section>

		<section class="rounded-md border border-stone-200 bg-white p-4">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-base font-semibold text-stone-950">Pending Repo Sync</h2>
					<p class="mt-2 text-sm text-stone-600">
						These are Tentman-managed
						<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">_tentmanId</code>
						values for stable navigation state. Tentman is already inferring them at runtime for
						configured repos, so navigation can work without manual repair. This section only shows
						configs where the repo files have not been synced yet.
					</p>
					<p class="mt-2 text-sm text-stone-600">
						You do not need to hand-manage these ids. Syncing just writes Tentman's current runtime
						identity state back into the repo so future staged changes and publishes include it.
					</p>
				</div>

				{#if setup.missingConfigIds.length > 0}
					<button
						type="button"
						class="inline-flex rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
						onclick={() => void handleAddMissingIds()}
						disabled={saving}
					>
						Sync ids to repo
					</button>
				{/if}
			</div>

			{#if setup.missingConfigIds.length === 0}
				<p class="mt-4 text-sm text-green-700">
					All top-level content config ids are already synced to the repo.
				</p>
			{:else}
				<div class="mt-4 space-y-2">
					{#each setup.missingConfigIds as config (config.path)}
						<div
							class="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"
						>
							<span class="font-medium">{config.label}</span>
							<span>
								is currently using runtime id
								<code class="rounded bg-yellow-100 px-1 py-0.5 text-xs">{config.suggestedId}</code>
								and can be synced to
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
								{collection.canOrderItems
									? 'Editable in collection panel'
									: 'Locked in collection panel'}
							</p>
						</div>
						{#if !collection.canOrderItems}
							<p class="mt-1 text-sm text-stone-500">
								Add
								<code class="rounded bg-stone-200 px-1 py-0.5 text-xs">collection.sorting: "manual"</code>,
								and
								<code class="rounded bg-stone-200 px-1 py-0.5 text-xs">idField</code>
								to unlock item reordering.
							</p>
							<p class="mt-1 text-sm text-stone-500">
								Once configured, Tentman can repair the stable item and group ids it needs while
								keeping
								<code class="rounded bg-stone-200 px-1 py-0.5 text-xs">idField</code>
								as the author-facing route field.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
