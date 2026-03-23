<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { localContent } from '$lib/stores/local-content';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const configs = $derived(isLocalMode ? $localContent.configs : data.configs);
	const currentPageSlug = $derived(page.params.page ?? null);
	const currentPath = $derived(page.url.pathname);

	function getContentKind(config: (typeof configs)[number]) {
		if (!config.config.collection) {
			return 'single';
		}

		return config.config.content.mode === 'directory' ? 'directory' : 'file';
	}

	onMount(() => {
		if (!isLocalMode) {
			return;
		}

		void localContent.refresh();
	});
</script>

<div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
	<aside class="space-y-4 lg:sticky lg:top-8 lg:self-start">
		<div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">Workspace</p>
			{#if isLocalMode}
				<h2 class="mt-2 text-lg font-semibold text-gray-900">
					{data.selectedBackend?.repo.name ?? 'Local repository'}
				</h2>
				<p class="mt-2 text-sm leading-6 text-gray-600">
					Local mode writes directly to files on disk. Git commits still happen in your terminal or
					Git client.
				</p>
				<div class="mt-4 flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
						onclick={() => void localContent.refresh({ force: true })}
					>
						Rescan repo
					</button>
					{#if $localContent.rootConfig?.local?.previewUrl}
						<a
							href={$localContent.rootConfig.local.previewUrl}
							target="_blank"
							rel="noreferrer"
							class="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
						>
							Open preview
						</a>
					{/if}
				</div>
			{:else if data.repo && 'full_name' in data.repo}
				<h2 class="mt-2 text-lg font-semibold text-gray-900">{data.repo.full_name}</h2>
				<p class="mt-2 text-sm leading-6 text-gray-600">
					Browse your content structure on the left, then work inside a narrower editing surface on
					the right.
				</p>
			{/if}
		</div>

		<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex items-center justify-between gap-3 border-b border-gray-100 px-1 pb-3">
				<div>
					<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
						Site Structure
					</p>
					<p class="mt-1 text-sm text-gray-600">
						{configs.length} content {configs.length === 1 ? 'type' : 'types'}
					</p>
				</div>
				<a
					href="/pages"
					class="rounded-full px-3 py-1 text-xs font-medium transition-colors hover:bg-gray-100"
					class:bg-gray-900={currentPath === '/pages'}
					class:text-white={currentPath === '/pages'}
					class:text-gray-700={currentPath !== '/pages'}
				>
					Overview
				</a>
			</div>

			{#if isLocalMode && $localContent.status === 'loading' && configs.length === 0}
				<p class="px-1 py-4 text-sm text-gray-500">Scanning local repository…</p>
			{:else if isLocalMode && $localContent.error}
				<p class="px-1 py-4 text-sm text-red-700">{$localContent.error}</p>
			{:else if configs.length === 0}
				<p class="px-1 py-4 text-sm text-gray-500">No content configs found yet.</p>
			{:else}
				<nav class="mt-3 space-y-2">
					{#each configs as config}
						<a
							href="/pages/{config.slug}"
							class="block rounded-xl border px-3 py-3 transition-colors"
							class:border-blue-200={currentPageSlug === config.slug}
							class:bg-blue-50={currentPageSlug === config.slug}
							class:text-blue-900={currentPageSlug === config.slug}
							class:border-gray-200={currentPageSlug !== config.slug}
							class:bg-white={currentPageSlug !== config.slug}
							class:text-gray-800={currentPageSlug !== config.slug}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="font-medium">{config.config.label}</p>
									<p class="mt-1 text-xs text-gray-500">{config.path}</p>
								</div>
								<span
									class="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600"
								>
									{getContentKind(config)}
								</span>
							</div>
						</a>
					{/each}
				</nav>
			{/if}
		</div>
	</aside>

	<section class="min-w-0">
		{@render children?.()}
	</section>
</div>
