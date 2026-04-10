<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import type { FileChange } from '$lib/content/adapters/types';
	import {
		appendDraftAssetsToFormData,
		getDraftAssetPreviewChanges
	} from '$lib/features/draft-assets/client';
	import { mergeChangesSummaryWithDraftAssets } from '$lib/features/draft-assets/shared';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { draftBranch } from '$lib/stores/draft-branch';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let isSubmitting = $state(false);
	let draftAssetError = $state<string | null>(null);
	let draftAssetChanges = $state<FileChange[]>([]);

	const contentDataString = $derived(JSON.stringify(data.contentData));
	const branchQuery = $derived(data.branch ? `?branch=${encodeURIComponent(data.branch)}` : '');
	const displayedChangesSummary = $derived(
		mergeChangesSummaryWithDraftAssets(data.changesSummary, draftAssetChanges)
	);

	$effect(() => {
		let active = true;
		draftAssetError = null;

		void getDraftAssetPreviewChanges(data.contentData)
			.then((changes) => {
				if (!active) {
					return;
				}

				draftAssetChanges = changes;
			})
			.catch((error) => {
				if (!active) {
					return;
				}

				draftAssetChanges = [];
				draftAssetError =
					error instanceof Error ? error.message : 'Failed to resolve staged draft assets';
			});

		return () => {
			active = false;
		};
	});

	async function cleanupDraftRefs(refs: string[]) {
		await Promise.all(refs.map((ref) => draftAssetStore.delete(ref)));
	}
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<h1 class="mb-2 text-3xl font-bold tracking-[-0.03em] text-stone-950">Preview Changes</h1>
		<p class="text-stone-600">
			Review the changes that will be made to <strong>{data.discoveredConfig.config.label}</strong>
		</p>
	</div>

	{#if form?.error}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
			<p class="font-semibold">Error</p>
			<p>{form.error}</p>
		</div>
	{/if}

	{#if draftAssetError}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
			<p class="font-semibold">Draft asset error</p>
			<p>{draftAssetError}</p>
		</div>
	{/if}

	{#if data.changesError}
		<div class="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
			<p class="font-semibold">Error calculating changes</p>
			<p>{data.changesError}</p>
		</div>
	{:else if displayedChangesSummary}
		<div class="mb-6 rounded-md border border-stone-200 bg-white">
			<div class="border-b border-stone-200 px-4 py-3">
				<h2 class="text-xl font-semibold text-stone-950">
					{displayedChangesSummary.totalChanges}
					{displayedChangesSummary.totalChanges === 1 ? 'file' : 'files'} will be changed
				</h2>
			</div>

			<div class="divide-y divide-stone-200">
				{#each displayedChangesSummary.files as file}
					<div class="px-4 py-3">
						<div class="mb-2 flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									{#if file.type === 'create'}
										<span
											class="inline-flex items-center rounded-sm bg-stone-900 px-2 py-1 text-xs font-medium text-white"
										>
											Create
										</span>
									{:else if file.type === 'update'}
										<span
											class="inline-flex items-center rounded-sm bg-stone-100 px-2 py-1 text-xs font-medium text-stone-800"
										>
											Update
										</span>
									{:else if file.type === 'delete'}
										<span
											class="inline-flex items-center rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800"
										>
											Delete
										</span>
									{/if}
									<code class="font-mono text-sm text-stone-700">{file.path}</code>
								</div>
								{#if file.size}
									<p class="mt-1 text-xs text-stone-500">
										Size: {(file.size / 1024).toFixed(2)} KB
									</p>
								{/if}
							</div>
						</div>

						{#if file.type === 'create' && file.newContent}
							<details class="mt-3">
								<summary
									class="cursor-pointer text-sm font-medium text-stone-700 hover:text-stone-950"
								>
									View content
								</summary>
								<pre
									class="mt-2 overflow-x-auto rounded-md border border-stone-200 bg-stone-50 p-3 text-xs">{file.newContent}</pre>
							</details>
						{:else if file.type === 'update' && file.oldContent && file.newContent}
							<details class="mt-3">
								<summary
									class="cursor-pointer text-sm font-medium text-stone-700 hover:text-stone-950"
								>
									View changes
								</summary>
								<div class="mt-2 grid grid-cols-2 gap-4">
									<div>
										<p class="mb-1 text-xs font-semibold text-stone-600">Before</p>
										<pre
											class="max-h-96 overflow-x-auto rounded-md border border-stone-200 bg-stone-50 p-3 text-xs">{file.oldContent}</pre>
									</div>
									<div>
										<p class="mb-1 text-xs font-semibold text-stone-600">After</p>
										<pre
											class="max-h-96 overflow-x-auto rounded-md border border-stone-200 bg-stone-50 p-3 text-xs">{file.newContent}</pre>
									</div>
								</div>
							</details>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-3 sm:flex-row">
			<form
				method="POST"
				action="?/createPreview"
				use:enhance={({ formData, cancel }) => {
					let submittedRefs: string[] = [];
					const prepareSubmission = (async () => {
						try {
							draftAssetError = null;
							const appended = await appendDraftAssetsToFormData(formData, data.contentData);
							submittedRefs = appended.refs;
							isSubmitting = true;
						} catch (error) {
							draftAssetError =
								error instanceof Error ? error.message : 'Failed to prepare staged draft assets';
							cancel();
							throw error;
						}
					})();

					return async ({ update, result }) => {
						try {
							await prepareSubmission;
						} catch {
							isSubmitting = false;
							return;
						}

						await update();
						// Update draft branch in store from redirect URL
						if (result.type === 'redirect' && result.location) {
							const url = new URL(result.location, window.location.origin);
							const branch = url.searchParams.get('branch');
							if (branch && data.repo) {
								const repoFullName = `${data.repo.owner}/${data.repo.name}`;
								draftBranch.setBranch(branch, repoFullName);
							}
						}
						if (result.type === 'redirect' || result.type === 'success') {
							await cleanupDraftRefs(submittedRefs);
						}
						isSubmitting = false;
					};
				}}
			>
				<input type="hidden" name="data" value={contentDataString} />
				{#if $draftBranch.branchName || data.branch}
					<input type="hidden" name="branchName" value={$draftBranch.branchName ?? data.branch} />
				{/if}
				<button
					type="submit"
					disabled={isSubmitting}
					class="w-full rounded-md bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
				>
					{#if isSubmitting}
						Saving to Draft...
					{:else}
						Save to Draft
					{/if}
				</button>
			</form>

			<form
				method="POST"
				action="?/publishNow"
				use:enhance={({ formData, cancel }) => {
					let submittedRefs: string[] = [];
					const prepareSubmission = (async () => {
						try {
							draftAssetError = null;
							const appended = await appendDraftAssetsToFormData(formData, data.contentData);
							submittedRefs = appended.refs;
							isSubmitting = true;
						} catch (error) {
							draftAssetError =
								error instanceof Error ? error.message : 'Failed to prepare staged draft assets';
							cancel();
							throw error;
						}
					})();

					return async ({ update, result }) => {
						try {
							await prepareSubmission;
						} catch {
							isSubmitting = false;
							return;
						}

						await update();
						if (result.type === 'redirect' || result.type === 'success') {
							await cleanupDraftRefs(submittedRefs);
						}
						isSubmitting = false;
					};
				}}
			>
				<input type="hidden" name="data" value={contentDataString} />
				<button
					type="submit"
					disabled={isSubmitting}
					class="w-full rounded-md border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
				>
					{#if isSubmitting}
						Publishing...
					{:else}
						Publish Now
					{/if}
				</button>
			</form>

			<a
				href="/pages/{data.discoveredConfig.slug}/edit{branchQuery}"
				class="w-full rounded-md bg-stone-100 px-5 py-2.5 text-center text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-200 sm:w-auto"
			>
				Cancel
			</a>
		</div>

		<div class="mt-5 rounded-md border border-stone-200 bg-stone-100 p-4">
			<h3 class="mb-2 font-semibold text-stone-950">What happens next?</h3>
			<ul class="list-inside list-disc space-y-1 text-sm text-stone-700">
				<li>
					<strong>Save to Draft:</strong> Saves your changes to a draft, then shows you the Netlify preview
					URL (builds in 2-3 minutes)
				</li>
				<li>
					<strong>Publish Now:</strong> Commits directly to the main branch (may fail if branch is protected)
				</li>
			</ul>
		</div>
	{/if}
</div>
