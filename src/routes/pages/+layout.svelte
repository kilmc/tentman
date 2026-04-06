<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import type { DiscoveredConfig } from '$lib/config/discovery';
	import { fetchContentDocument } from '$lib/content/service';
	import type { CollectionNavigationItem } from '$lib/features/content-management/navigation';
	import {
		getCollectionNavigationItems,
		getConfigItemLabel
	} from '$lib/features/content-management/navigation';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { buildLoginRedirect } from '$lib/utils/routing';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	type CollectionItemsBySlug = Record<string, CollectionNavigationItem[]>;
	type CollectionLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

	let localCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionLoadStatusBySlug = $state<Record<string, CollectionLoadStatus>>({});
	let githubCollectionErrorBySlug = $state<Record<string, string | null>>({});
	let collectionLoadRequest = 0;
	let expandedCollections = $state<Record<string, boolean>>({});

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const configs = $derived(isLocalMode ? $localContent.configs : data.configs);
	const collectionItemsBySlug = $derived(
		isLocalMode ? localCollectionItemsBySlug : githubCollectionItemsBySlug
	);
	const currentPageSlug = $derived(page.params.page ?? null);
	const currentItemId = $derived(page.params.itemId ?? null);

	function isCollectionExpanded(slug: string) {
		return expandedCollections[slug] ?? currentPageSlug === slug;
	}

	function getGitHubCollectionStatus(slug: string): CollectionLoadStatus {
		return githubCollectionLoadStatusBySlug[slug] ?? 'idle';
	}

	function getGitHubCollectionError(slug: string): string | null {
		return githubCollectionErrorBySlug[slug] ?? null;
	}

	function toggleCollection(config: DiscoveredConfig) {
		const nextExpanded = !isCollectionExpanded(config.slug);

		expandedCollections = {
			...expandedCollections,
			[config.slug]: nextExpanded
		};

		if (!isLocalMode && nextExpanded) {
			void loadGitHubCollectionItems(config);
		}
	}

	function getCollectionItems(slug: string) {
		return collectionItemsBySlug[slug] ?? [];
	}

	async function redirectToLoginForExpiredSession() {
		window.location.assign(buildLoginRedirect(resolve('/auth/login'), window.location));
	}

	async function loadGitHubCollectionItems(
		config: DiscoveredConfig,
		options?: { force?: boolean }
	) {
		if (isLocalMode || !config.config.collection) {
			return;
		}

		const status = getGitHubCollectionStatus(config.slug);
		if (!options?.force && (status === 'loading' || status === 'ready')) {
			return;
		}

		githubCollectionLoadStatusBySlug = {
			...githubCollectionLoadStatusBySlug,
			[config.slug]: 'loading'
		};
		githubCollectionErrorBySlug = {
			...githubCollectionErrorBySlug,
			[config.slug]: null
		};

		try {
			const response = await fetch(
				`${resolve('/api/repo/collection-items')}?slug=${encodeURIComponent(config.slug)}`
			);

			if (response.status === 401) {
				await redirectToLoginForExpiredSession();
				return;
			}

			if (!response.ok) {
				throw new Error(`Failed to load collection items (${response.status})`);
			}

			const payload = (await response.json()) as {
				items?: CollectionNavigationItem[];
			};

			githubCollectionItemsBySlug = {
				...githubCollectionItemsBySlug,
				[config.slug]: payload.items ?? []
			};
			githubCollectionLoadStatusBySlug = {
				...githubCollectionLoadStatusBySlug,
				[config.slug]: 'ready'
			};
		} catch (error) {
			githubCollectionLoadStatusBySlug = {
				...githubCollectionLoadStatusBySlug,
				[config.slug]: 'error'
			};
			githubCollectionErrorBySlug = {
				...githubCollectionErrorBySlug,
				[config.slug]: error instanceof Error ? error.message : 'Failed to load items'
			};
		}
	}

	async function loadLocalCollectionItems(availableConfigs: DiscoveredConfig[]) {
		const repoState = get(localRepo);
		if (!repoState.backend) {
			localCollectionItemsBySlug = {};
			return;
		}

		const requestId = ++collectionLoadRequest;
		const collectionEntries = await Promise.all(
			availableConfigs
				.filter((config) => config.config.collection)
				.map(async (config) => {
					try {
						const content = await fetchContentDocument(
							repoState.backend!,
							config.config,
							config.path
						);

						return [config.slug, getCollectionNavigationItems(config.config, content)] as const;
					} catch (error) {
						console.error(`Failed to load local sidebar items for ${config.slug}:`, error);
						return [config.slug, []] as const;
					}
				})
		);

		if (requestId !== collectionLoadRequest) {
			return;
		}

		localCollectionItemsBySlug = Object.fromEntries(collectionEntries);
	}

	onMount(() => {
		if (!isLocalMode) {
			return;
		}

		void localContent.refresh();
	});

	$effect(() => {
		if (!currentPageSlug) {
			return;
		}

		const currentConfig = configs.find(
			(config: DiscoveredConfig) => config.slug === currentPageSlug
		);
		if (!currentConfig?.config.collection) {
			return;
		}

		if (expandedCollections[currentPageSlug]) {
			return;
		}

		expandedCollections = {
			...expandedCollections,
			[currentPageSlug]: true
		};
	});

	$effect(() => {
		if (!isLocalMode || $localContent.status !== 'ready') {
			return;
		}

		void loadLocalCollectionItems(configs);
	});

	$effect(() => {
		if (isLocalMode || !currentPageSlug) {
			return;
		}

		const currentConfig = configs.find(
			(config: DiscoveredConfig) => config.slug === currentPageSlug
		);
		if (!currentConfig?.config.collection) {
			return;
		}

		void loadGitHubCollectionItems(currentConfig);
	});
</script>

<div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
	<aside class="space-y-4 lg:sticky lg:top-8 lg:self-start">
		<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="border-b border-gray-100 px-1 pb-3">
				<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
					Site Structure
				</p>
				<p class="mt-1 text-sm text-gray-600">
					{configs.length} content {configs.length === 1 ? 'type' : 'types'}
				</p>
			</div>

			{#if isLocalMode && $localContent.status === 'loading' && configs.length === 0}
				<p class="px-1 py-4 text-sm text-gray-500">Scanning local repository…</p>
			{:else if isLocalMode && $localContent.error}
				<p class="px-1 py-4 text-sm text-red-700">{$localContent.error}</p>
			{:else if configs.length === 0}
				<p class="px-1 py-4 text-sm text-gray-500">No content configs found yet.</p>
			{:else}
				<nav class="mt-3 space-y-2">
					{#each configs as config (config.slug)}
						{@const isCollection = !!config.config.collection}
						{@const isSelected = currentPageSlug === config.slug}
						{@const isExpanded = isCollectionExpanded(config.slug)}
						<div
							class="rounded-xl border border-gray-200 bg-white transition-colors"
							class:border-blue-200={isSelected}
							class:bg-blue-50={isSelected}
						>
							<div class="flex items-center gap-2 p-2">
								{#if isCollection}
									<button
										type="button"
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
										onclick={() => toggleCollection(config)}
										aria-expanded={isExpanded}
										aria-label={isExpanded ? 'Collapse collection' : 'Expand collection'}
									>
										<svg
											viewBox="0 0 20 20"
											fill="none"
											stroke="currentColor"
											stroke-width="1.75"
											class="h-4 w-4 transition-transform"
											class:rotate-90={isExpanded}
										>
											<path d="M7 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
										</svg>
									</button>
								{:else}
									<span class="h-8 w-8 shrink-0"></span>
								{/if}

								<a
									href={resolve(`/pages/${config.slug}`)}
									class="min-w-0 flex-1 rounded-lg px-3 py-2 transition-colors hover:bg-white/80"
									class:text-blue-900={isSelected}
									class:text-gray-800={!isSelected}
								>
									<p class="truncate font-medium">{config.config.label}</p>
									{#if isCollection}
										<p class="mt-1 text-xs text-gray-500">
											{#if isLocalMode || getGitHubCollectionStatus(config.slug) === 'ready'}
												{getCollectionItems(config.slug).length}
												{getCollectionItems(config.slug).length === 1 ? 'item' : 'items'}
											{:else if getGitHubCollectionStatus(config.slug) === 'loading'}
												Loading items…
											{:else if getGitHubCollectionStatus(config.slug) === 'error'}
												Couldn't load items
											{/if}
										</p>
									{/if}
								</a>

								{#if isCollection}
									<a
										href={resolve(`/pages/${config.slug}/new`)}
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
										aria-label={`New ${getConfigItemLabel(config.config)}`}
										title={`New ${getConfigItemLabel(config.config)}`}
									>
										+
									</a>
								{/if}
							</div>

							{#if isCollection && isExpanded}
								{@const items = getCollectionItems(config.slug)}
								<div class="px-3 pb-3">
									{#if isLocalMode && $localContent.status === 'loading' && items.length === 0}
										<p class="pl-10 text-sm text-gray-500">Loading items…</p>
									{:else if !isLocalMode && ['idle', 'loading'].includes(getGitHubCollectionStatus(config.slug)) && items.length === 0}
										<p class="pl-10 text-sm text-gray-500">Loading items…</p>
									{:else if !isLocalMode && getGitHubCollectionStatus(config.slug) === 'error' && items.length === 0}
										<div class="pl-10 text-sm text-red-700">
											<p>{getGitHubCollectionError(config.slug) ?? "Couldn't load items."}</p>
											<button
												type="button"
												class="mt-2 text-sm font-medium text-red-700 underline hover:text-red-800"
												onclick={() => void loadGitHubCollectionItems(config, { force: true })}
											>
												Retry
											</button>
										</div>
									{:else if items.length === 0}
										<p class="pl-10 text-sm text-gray-500">No items yet.</p>
									{:else}
										<div class="space-y-1 pl-10">
											{#each items as item (item.itemId)}
												<a
													href={resolve(`/pages/${config.slug}/${item.itemId}`)}
													class="block rounded-lg px-3 py-2 text-sm transition-colors"
													class:bg-blue-100={isSelected && currentItemId === item.itemId}
													class:text-blue-900={isSelected && currentItemId === item.itemId}
													class:text-gray-700={!(isSelected && currentItemId === item.itemId)}
													class:hover:bg-gray-100={!(isSelected && currentItemId === item.itemId)}
												>
													{item.title}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</nav>
			{/if}
		</div>

		{#if isLocalMode}
			<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
						onclick={() => void localContent.refresh({ force: true })}
					>
						Rescan repo
					</button>
					{#if $localContent.rootConfig?.local?.previewUrl}
						<button
							type="button"
							onclick={() =>
								window.open(
									$localContent.rootConfig?.local?.previewUrl,
									'_blank',
									'noopener,noreferrer'
								)}
							class="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
						>
							Open preview
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</aside>

	<section class="min-w-0">
		{@render children?.()}
	</section>
</div>
