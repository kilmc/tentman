<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';

	let { data }: { data: PageData } = $props();
	let publishing = $state(false);
	let discarding = $state(false);
</script>

<div class="container mx-auto p-6 max-w-5xl">
	<div class="mb-6">
		<a href="/pages" class="text-sm text-blue-600 hover:underline">&larr; Back to content</a>
	</div>

	<h1 class="text-3xl font-bold mb-2">Publish Changes</h1>
	<p class="text-gray-600 mb-8">
		Review and publish all draft changes to the main branch.
	</p>

	<div class="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
		<p class="text-sm text-blue-800">
			<span class="font-medium">Draft Branch:</span>
			<code class="ml-2 text-xs bg-blue-100 px-2 py-1 rounded">{data.draftBranch.name}</code>
		</p>
		<p class="text-sm text-blue-700 mt-2">
			{data.commits.length} commit{data.commits.length === 1 ? '' : 's'} •
			{data.configsWithChanges.length} content type{data.configsWithChanges.length === 1 ? '' : 's'} changed
		</p>
	</div>

	<!-- Configs with changes -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-4">Changed Content</h2>
		<div class="space-y-3">
			{#each data.configsWithChanges as { config, changes }}
				<div class="rounded-lg border border-gray-200 bg-white p-4">
					<div class="flex items-start justify-between">
						<div>
							<h3 class="font-medium text-gray-900">{config.config.label}</h3>
							<p class="text-sm text-gray-600 mt-1">
								{#if changes.modified.length > 0}
									<span class="mr-3">✏️ {changes.modified.length} modified</span>
								{/if}
								{#if changes.created.length > 0}
									<span class="mr-3">✨ {changes.created.length} created</span>
								{/if}
								{#if changes.deleted.length > 0}
									<span>🗑️ {changes.deleted.length} deleted</span>
								{/if}
							</p>
						</div>
						<a
							href="/pages/{config.slug}"
							class="text-sm text-blue-600 hover:underline"
						>
							View
						</a>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Commits -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-4">Commits ({data.commits.length})</h2>
		<div class="space-y-2">
			{#each data.commits as commit}
				<div class="rounded border border-gray-200 bg-white p-3">
					<p class="text-sm font-medium text-gray-900">{commit.message}</p>
					<div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
						<span>{commit.author.name}</span>
						<span>•</span>
						<span>{new Date(commit.author.date).toLocaleString()}</span>
						<a
							href={commit.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-blue-600 hover:underline"
						>
							View on GitHub →
						</a>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Actions -->
	<div class="flex flex-col sm:flex-row gap-3 border-t border-gray-200 pt-6">
		<form
			method="POST"
			action="?/publish"
			use:enhance={() => {
				publishing = true;
				return async ({ update }) => {
					await update();
					// Clear draft branch from store on success
					draftBranchStore.clear();
					publishing = false;
				};
			}}
		>
			<button
				type="submit"
				disabled={publishing || discarding}
				class="w-full sm:w-auto rounded-lg bg-green-600 px-6 py-3 font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
			>
				{#if publishing}
					Publishing...
				{:else}
					Publish to Main
				{/if}
			</button>
		</form>

		<form
			method="POST"
			action="?/discard"
			use:enhance={() => {
				if (!confirm('Are you sure you want to discard all draft changes? This cannot be undone.')) {
					return ({ cancel }) => cancel();
				}
				discarding = true;
				return async ({ update }) => {
					await update();
					// Clear draft branch from store on success
					draftBranchStore.clear();
					discarding = false;
				};
			}}
		>
			<button
				type="submit"
				disabled={publishing || discarding}
				class="w-full sm:w-auto rounded-lg border border-red-300 bg-white px-6 py-3 font-medium text-red-700 hover:bg-red-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
			>
				{#if discarding}
					Discarding...
				{:else}
					Discard Draft
				{/if}
			</button>
		</form>

		<a
			href="/pages"
			class="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 text-center transition-colors"
		>
			Cancel
		</a>
	</div>
</div>
