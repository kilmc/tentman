<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';

	let { data }: { data: PageData } = $props();
	let publishing = $state(false);
	let discarding = $state(false);
</script>

<div class="mx-auto max-w-5xl">
	<h1 class="mb-2 text-3xl font-bold tracking-[-0.03em] text-stone-950">Publish Changes</h1>
	<p class="mb-6 text-stone-600">Review and publish all draft changes to the main branch.</p>

	<div class="mb-6 rounded-md border border-stone-200 bg-stone-100 p-4">
		<p class="text-sm text-stone-900">
			<span class="font-medium">Draft Branch:</span>
			<code class="ml-2 rounded bg-white px-2 py-1 text-xs">{data.draftBranch.name}</code>
		</p>
		<p class="mt-2 text-sm text-stone-600">
			{data.commits.length} commit{data.commits.length === 1 ? '' : 's'} •
			{data.configsWithChanges.length} content type{data.configsWithChanges.length === 1 ? '' : 's'}
			changed
		</p>
	</div>

	<!-- Configs with changes -->
	<div class="mb-6">
		<h2 class="mb-3 text-xl font-semibold text-stone-950">Changed Content</h2>
		<div class="space-y-3">
			{#each data.configsWithChanges as { config, changes }}
				<div class="rounded-md border border-stone-200 bg-white p-4">
					<div class="flex items-start justify-between">
						<div>
							<h3 class="font-medium text-stone-950">{config.config.label}</h3>
							<p class="mt-1 text-sm text-stone-600">
								{#if changes.modified.length > 0}
									<span class="mr-3">{changes.modified.length} modified</span>
								{/if}
								{#if changes.created.length > 0}
									<span class="mr-3">{changes.created.length} created</span>
								{/if}
								{#if changes.deleted.length > 0}
									<span>{changes.deleted.length} deleted</span>
								{/if}
							</p>
						</div>
						<a
							href={config.config.collection
								? `/pages/${config.slug}`
								: `/pages/${config.slug}/edit`}
							class="text-sm font-medium text-stone-700 hover:text-stone-950"
						>
							Open
						</a>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Commits -->
	<div class="mb-6">
		<h2 class="mb-3 text-xl font-semibold text-stone-950">Commits ({data.commits.length})</h2>
		<div class="space-y-2">
			{#each data.commits as commit}
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-sm font-medium text-stone-950">{commit.message}</p>
					<div class="mt-1 flex items-center gap-3 text-xs text-stone-500">
						<span>{commit.author.name}</span>
						<span>•</span>
						<span>{new Date(commit.author.date).toLocaleString()}</span>
						<a
							href={commit.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-stone-700 hover:text-stone-950"
						>
							View on GitHub →
						</a>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Actions -->
	<div class="flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row">
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
				class="w-full rounded-md bg-stone-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400 sm:w-auto"
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
			use:enhance={({ cancel }) => {
				if (
					!confirm('Are you sure you want to discard all draft changes? This cannot be undone.')
				) {
					cancel();
					return;
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
				class="w-full rounded-md border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 sm:w-auto"
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
			class="w-full rounded-md border border-stone-300 bg-white px-5 py-2.5 text-center text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 sm:w-auto"
		>
			Cancel
		</a>
	</div>
</div>
