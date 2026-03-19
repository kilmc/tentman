<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import KeyboardShortcutHelp from '$lib/components/KeyboardShortcutHelp.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { registerKeyboardShortcuts } from '$lib/utils/keyboard';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { get } from 'svelte/store';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { fetchContentDocument, saveContentDocument } from '$lib/content/service';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isLocalMode = data.mode === 'local';

	let discoveredConfig = $state(data.discoveredConfig);
	let blockConfigs = $state(data.blockConfigs ?? []);
	let content = $state(data.content);
	let contentError = $state(data.contentError);
	let formGenerator = $state<FormGenerator | null>(null);
	let currentForm = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let hasUnsavedChanges = $state(false);
	let localError = $state<string | null>(null);

	const config = $derived(discoveredConfig?.config ?? null);

	function handleFieldsChanged() {
		hasUnsavedChanges = true;
	}

	beforeNavigate(({ cancel }) => {
		if (hasUnsavedChanges && !saving) {
			if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
				cancel();
			}
		}
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

		if (isLocalMode) {
			void loadLocalContent();
		}

		return cleanup;
	});

	async function loadLocalContent() {
		await localContent.refresh();
		const repoState = get(localRepo);
		const contentState = get(localContent);

		discoveredConfig = contentState.configs.find((entry) => entry.slug === data.pageSlug) ?? null;
		blockConfigs = contentState.blockConfigs;

		if (!repoState.backend || !discoveredConfig) {
			contentError = 'Configuration not found';
			return;
		}

		try {
			content = await fetchContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path
			);
		} catch (error) {
			contentError = error instanceof Error ? error.message : 'Failed to load content';
		}
	}

	async function handleLocalSave() {
		if (!formGenerator || !discoveredConfig || !config) {
			return;
		}

		const repoState = get(localRepo);
		if (!repoState.backend) {
			localError = 'No local repository is open.';
			return;
		}

		const { data: formData, errors } = formGenerator.validate();
		if (errors.length > 0) {
			return;
		}

		saving = true;
		hasUnsavedChanges = false;
		localError = null;

		try {
			await saveContentDocument(
				repoState.backend,
				discoveredConfig.config,
				discoveredConfig.path,
				formData
			);
			await localContent.refresh();
			await goto(`/pages/${discoveredConfig.slug}?published=true`);
		} catch (error) {
			localError = error instanceof Error ? error.message : 'Failed to save local changes';
		} finally {
			saving = false;
		}
	}
</script>

<div class="container mx-auto p-4 sm:p-6">
	<div class="mb-4 sm:mb-6">
		<a href="/pages/{data.pageSlug}" class="text-sm text-blue-600 hover:underline">&larr; Back</a>
	</div>

	<div class="mb-4 sm:mb-6">
		<h1 class="text-2xl font-bold sm:text-3xl">
			Edit {config?.label ?? 'Content'}
		</h1>
	</div>

	{#if form?.error || localError}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-sm font-medium text-red-800">Failed to save changes</p>
			<p class="mt-1 text-sm text-red-700">{form?.error || localError}</p>
		</div>
	{/if}

	{#if contentError}
		<div class="rounded-lg border border-red-200 bg-red-50 p-6">
			<h2 class="mb-2 font-semibold text-red-800">Failed to Load Content</h2>
			<p class="text-sm text-red-700">{contentError}</p>
		</div>
	{:else if content === null || !config}
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
			<LoadingSpinner size="lg" label="Loading content..." />
		</div>
	{:else}
		<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
				<h2 class="font-semibold">Content</h2>
			</div>
			<div class="p-6">
				{#if isLocalMode}
					<form bind:this={currentForm} onsubmit={(event) => event.preventDefault()}>
						<input type="hidden" name="data" value="" />
						<FormGenerator
							bind:this={formGenerator}
							{config}
							{blockConfigs}
							initialData={content}
							existingItems={[]}
							currentItemId={undefined}
							onvalidate={handleFieldsChanged}
						/>
						<div class="mt-6 flex gap-3">
							<button
								type="button"
								onclick={() => void handleLocalSave()}
								disabled={saving}
								class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
							>
								{saving ? 'Saving...' : 'Save Changes'}
							</button>
							<a
								href="/pages/{data.pageSlug}"
								class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</a>
						</div>
					</form>
				{:else}
					<form
						bind:this={currentForm}
						method="POST"
						action="?/saveToPreview"
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
						<FormGenerator
							bind:this={formGenerator}
							{config}
							{blockConfigs}
							initialData={content}
							existingItems={[]}
							currentItemId={undefined}
							onvalidate={handleFieldsChanged}
						/>
						<div class="mt-6 flex gap-3">
							<button
								type="submit"
								disabled={saving}
								class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
							>
								{saving ? 'Saving...' : 'Continue'}
							</button>
							<a
								href="/pages/{data.pageSlug}"
								class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</a>
						</div>
					</form>
				{/if}
			</div>
		</div>
	{/if}

	<KeyboardShortcutHelp />
</div>
