<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { draftBranch } from '$lib/stores/draft-branch';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let isSubmitting = $state(false);

	const contentDataString = $derived(JSON.stringify(data.contentData));
</script>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-6">
		<a
			href="/pages/{data.discoveredConfig.slug}/edit"
			class="text-blue-600 hover:text-blue-800 text-sm"
		>
			← Back to Edit
		</a>
	</div>

	<div class="mb-8">
		<h1 class="text-3xl font-bold mb-2">Preview Changes</h1>
		<p class="text-gray-600">
			Review the changes that will be made to <strong>{data.discoveredConfig.config.label}</strong>
		</p>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
			<p class="font-semibold">Error</p>
			<p>{form.error}</p>
		</div>
	{/if}

	{#if data.changesError}
		<div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
			<p class="font-semibold">Error calculating changes</p>
			<p>{data.changesError}</p>
		</div>
	{:else if data.changesSummary}
		<div class="bg-white border border-gray-200 rounded-lg shadow-sm mb-8">
			<div class="px-6 py-4 border-b border-gray-200">
				<h2 class="text-xl font-semibold">
					{data.changesSummary.totalChanges}
					{data.changesSummary.totalChanges === 1 ? 'file' : 'files'} will be changed
				</h2>
			</div>

			<div class="divide-y divide-gray-200">
				{#each data.changesSummary.files as file}
					<div class="px-6 py-4">
						<div class="flex items-start justify-between mb-2">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									{#if file.type === 'create'}
										<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
											Create
										</span>
									{:else if file.type === 'update'}
										<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
											Update
										</span>
									{:else if file.type === 'delete'}
										<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
											Delete
										</span>
									{/if}
									<code class="text-sm font-mono text-gray-700">{file.path}</code>
								</div>
								{#if file.size}
									<p class="text-xs text-gray-500 mt-1">
										Size: {(file.size / 1024).toFixed(2)} KB
									</p>
								{/if}
							</div>
						</div>

						{#if file.type === 'create' && file.newContent}
							<details class="mt-3">
								<summary class="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
									View content
								</summary>
								<pre class="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto border border-gray-200">{file.newContent}</pre>
							</details>
						{:else if file.type === 'update' && file.oldContent && file.newContent}
							<details class="mt-3">
								<summary class="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
									View changes
								</summary>
								<div class="mt-2 grid grid-cols-2 gap-4">
									<div>
										<p class="text-xs font-semibold text-gray-600 mb-1">Before</p>
										<pre class="p-3 bg-gray-50 rounded text-xs overflow-x-auto border border-gray-200 max-h-96">{file.oldContent}</pre>
									</div>
									<div>
										<p class="text-xs font-semibold text-gray-600 mb-1">After</p>
										<pre class="p-3 bg-gray-50 rounded text-xs overflow-x-auto border border-gray-200 max-h-96">{file.newContent}</pre>
									</div>
								</div>
							</details>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<div class="flex flex-col sm:flex-row gap-4">
			<form method="POST" action="?/createPreview" use:enhance={() => {
				isSubmitting = true;
				return async ({ update, result }) => {
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
					isSubmitting = false;
				};
			}}>
				<input type="hidden" name="data" value={contentDataString} />
				{#if $draftBranch.branchName}
					<input type="hidden" name="branchName" value={$draftBranch.branchName} />
				{/if}
				<button
					type="submit"
					disabled={isSubmitting}
					class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{#if isSubmitting}
						Saving to Draft...
					{:else}
						Save to Draft
					{/if}
				</button>
			</form>

			<form method="POST" action="?/publishNow" use:enhance={() => {
				isSubmitting = true;
				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}>
				<input type="hidden" name="data" value={contentDataString} />
				<button
					type="submit"
					disabled={isSubmitting}
					class="w-full sm:w-auto px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{#if isSubmitting}
						Publishing...
					{:else}
						Publish Now
					{/if}
				</button>
			</form>

			<a
				href="/pages/{data.discoveredConfig.slug}/edit"
				class="w-full sm:w-auto px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 text-center transition-colors"
			>
				Back to Edit
			</a>
		</div>

		<div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
			<h3 class="font-semibold text-blue-900 mb-2">What happens next?</h3>
			<ul class="text-sm text-blue-800 space-y-1 list-disc list-inside">
				<li>
					<strong>Save to Draft:</strong> Saves your changes to a draft, then shows you
					the Netlify preview URL (builds in 2-3 minutes)
				</li>
				<li>
					<strong>Publish Now:</strong> Commits directly to the main branch (may fail if branch is
					protected)
				</li>
			</ul>
		</div>
	{/if}
</div>
