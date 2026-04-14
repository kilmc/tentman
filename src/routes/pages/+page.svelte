<script lang="ts">
	import { resolve } from '$app/paths';
	import { localContent } from '$lib/stores/local-content';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const hasChanges = $derived(data.summary.changedPages.length > 0);
	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const hasConfigs = $derived(isLocalMode ? $localContent.configs.length > 0 : data.summary.hasConfigs);
</script>

<div class="grid gap-6">
	<section class="rounded-[1.5rem] border border-stone-200 bg-white p-6 sm:p-8">
		<p class="text-xs font-semibold tracking-[0.24em] text-stone-500 uppercase">Overview</p>
		<h1 class="mt-3 text-4xl font-black tracking-[-0.05em] text-stone-950 sm:text-5xl">
			Site overview
		</h1>
		<p class="mt-4 max-w-2xl text-base leading-7 text-stone-600">
			Keep an eye on what has changed before you move back into the editor. When there is draft
			activity, the affected pages will show up here.
		</p>
	</section>

	<section class="rounded-xl border border-stone-200 bg-white p-5">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">New work</p>
				<h2 class="mt-2 text-2xl font-bold tracking-[-0.04em] text-stone-950">
					Add a page
				</h2>
				<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
					Create a new page with a guided setup flow, then confirm it before anything is
					saved.
				</p>
			</div>

			<a
				href={resolve('/pages/new')}
				class="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
			>
				Add page
			</a>
		</div>
	</section>

	{#if !hasConfigs}
		<section class="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
			<h2 class="text-xl font-semibold text-yellow-950">No content configs found</h2>
			<p class="mt-2 text-sm text-yellow-900">
				Create a <code class="rounded bg-yellow-100 px-1">*.tentman.json</code> content config to start
				editing this site.
			</p>
		</section>
	{:else if hasChanges}
		<section class="rounded-xl border border-stone-200 bg-white p-5">
			<div class="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-4">
				<div>
					<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
						Current state
					</p>
					<h2 class="mt-2 text-2xl font-bold tracking-[-0.04em] text-stone-950">
						{data.summary.totalChanges}
						{data.summary.totalChanges === 1 ? 'change' : 'changes'} waiting
					</h2>
				</div>
				{#if data.summary.draftBranch}
					<p class="text-sm text-stone-500">
						Draft branch
						<code class="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs">
							{data.summary.draftBranch}
						</code>
					</p>
				{/if}
			</div>

			<div class="mt-4 grid gap-3">
				{#each data.summary.changedPages as changedPage (changedPage.slug)}
					<a
						href={resolve(`/pages/${changedPage.slug}`)}
						class="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 transition-colors hover:border-stone-300 hover:bg-white"
					>
						<div class="flex items-start justify-between gap-4">
							<div>
								<p class="text-lg font-semibold text-stone-950">{changedPage.label}</p>
								<p class="mt-1 text-sm text-stone-500">
									{changedPage.changeCount}
									{changedPage.changeCount === 1 ? 'change' : 'changes'}
									{changedPage.isCollection ? ' in this collection' : ' on this page'}
								</p>
							</div>
							<span class="text-sm font-semibold text-stone-700">Open</span>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{:else}
		<section
			class="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center"
		>
			<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">Current state</p>
			<h2 class="mt-3 text-2xl font-bold tracking-[-0.04em] text-stone-950">
				Nothing to report at the moment
			</h2>
			<p class="mt-3 text-sm leading-6 text-stone-600">
				Once draft changes are in play, this page will list the sections of the site that need
				attention.
			</p>
		</section>
	{/if}
</div>
