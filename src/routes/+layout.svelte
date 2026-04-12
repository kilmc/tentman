<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { draftBranch } from '$lib/stores/draft-branch';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { traceRouting } from '$lib/utils/routing-trace';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	const appHomeHref = $derived(data.selectedBackend ? '/pages' : '/');
	const isPagesWorkspace = $derived(page.url.pathname.startsWith('/pages'));
	const isSplashPage = $derived(
		page.url.pathname === '/' && !data.isAuthenticated && !data.selectedBackend
	);
	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const siteName = $derived.by(() => {
		if (isLocalMode) {
			return $localContent.rootConfig?.siteName ?? data.selectedBackend.repo.name;
		}

		return data.rootConfig?.siteName ?? data.selectedRepo?.name ?? 'Tentman';
	});
	const repoLabel = $derived.by(() => {
		if (data.selectedBackend?.kind === 'github' && data.selectedRepo) {
			return data.selectedRepo.full_name;
		}

		if (isLocalMode) {
			return data.selectedBackend.repo.name;
		}

		return null;
	});
	const previewUrl = $derived(
		isLocalMode ? ($localContent.rootConfig?.local?.previewUrl ?? null) : null
	);
	const currentRoutePath = $derived(`${page.url.pathname}${page.url.search}`);

	$effect(() => {
		traceRouting('route', {
			path: currentRoutePath,
			authenticated: data.isAuthenticated,
			selectedBackend: data.selectedBackend?.kind ?? null,
			selectedRepo: data.selectedRepo?.full_name ?? null,
			repoLabel,
			siteName
		});
	});

	$effect(() => {
		if (!isLocalMode) {
			localContent.reset();
			return;
		}

		void (async () => {
			await localRepo.hydrate();
			await localContent.refresh();
		})();
	});

	async function handleSwitchRepository() {
		if (isLocalMode) {
			localContent.reset();
			await localRepo.clear({ invalidate: false });
		}

		await goto(resolve('/repos'));
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isPagesWorkspace}
	{@render children?.()}
	<ToastContainer />
{:else if isSplashPage}
	<div class="min-h-screen bg-stone-50" data-sveltekit-preload-data="hover">
		{@render children?.()}
		<ToastContainer />
	</div>
{:else}
	<!-- Enable hover prefetch globally for instant navigation -->
	<div class="flex min-h-screen flex-col bg-stone-50" data-sveltekit-preload-data="hover">
		<header class="border-b border-stone-200 bg-white/95 backdrop-blur">
			<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="flex min-h-14 items-center justify-between gap-4 py-3">
					<div class="min-w-0">
						<a
							href={resolve(appHomeHref)}
							class="inline-flex max-w-full items-center gap-2 text-base font-semibold tracking-[-0.02em] text-stone-950"
						>
							{#if isLocalMode}
								<span
									class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-300 bg-stone-100 text-stone-700"
									aria-label="Local repository"
									title="Local repository"
								>
									<svg
										viewBox="0 0 20 20"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										class="h-3.5 w-3.5"
									>
										<path d="M4 6.5h12v7H4z" stroke-linejoin="round" />
										<path d="M7 10h6" stroke-linecap="round" />
									</svg>
								</span>
							{/if}
							<span class="truncate">{siteName}</span>
						</a>

						{#if repoLabel}
							<p class="truncate pt-0.5 text-sm text-stone-500">{repoLabel}</p>
						{/if}
					</div>

					<div class="flex items-center gap-2">
						{#if previewUrl}
							<button
								type="button"
								class="inline-flex items-center rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
								onclick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
							>
								Preview
							</button>
						{/if}

						{#if data.isAuthenticated}
							{#if $draftBranch.branchName}
								<a
									href={resolve('/publish')}
									class="inline-flex items-center rounded-md bg-stone-950 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
								>
									Publish Changes
								</a>
							{/if}
						{/if}

						{#if data.selectedBackend || data.isAuthenticated}
							<details class="relative">
								<summary
									class="flex cursor-pointer list-none items-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
								>
									<span>Settings</span>
									<svg
										viewBox="0 0 20 20"
										fill="none"
										stroke="currentColor"
										stroke-width="1.6"
										class="h-4 w-4"
									>
										<path d="M5 7.5L10 12l5-4.5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</summary>

								<div
									class="absolute right-0 z-20 mt-2 min-w-52 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
								>
									{#if data.selectedBackend}
										<a
											href={resolve('/pages/settings')}
											class="block rounded-md px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100"
										>
											Site settings
										</a>
										<button
											type="button"
											class="block w-full rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
											onclick={() => void handleSwitchRepository()}
										>
											Switch repo
										</button>
									{/if}

									{#if isLocalMode}
										<button
											type="button"
											class="block w-full rounded-md px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
											onclick={() => void localContent.refresh({ force: true })}
										>
											Rescan repo
										</button>
									{/if}

									{#if data.isAuthenticated}
										<a
											href={resolve('/auth/logout')}
											class="block rounded-md px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100"
										>
											Logout
										</a>
									{/if}
								</div>
							</details>
						{:else}
							<div class="flex items-center gap-3">
								<a
									href={resolve('/repos')}
									class="rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
								>
									GitHub
								</a>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</header>

		<main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
			{@render children?.()}
		</main>

		<footer class="border-t border-stone-200 bg-white">
			<div class="mx-auto flex max-w-7xl items-center justify-end px-4 py-4 sm:px-6 lg:px-8">
				<a
					href={resolve('/docs')}
					class="text-sm text-stone-500 transition-colors hover:text-stone-900"
				>
					Docs
				</a>
			</div>
		</footer>

		<ToastContainer />
	</div>
{/if}
