<script lang="ts">
	import { dev } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import LocalRepoButton from '$lib/components/LocalRepoButton.svelte';
	import RepositoryPickerCard from '$lib/components/RepositoryPickerCard.svelte';
	import { readLastRoutingFailure } from '$lib/utils/dev-routing-browser';
	import { buildPathWithQuery, sanitizeAuthRedirectTarget } from '$lib/utils/routing';
	import { logDevRouting } from '$lib/utils/dev-routing-log';
	import type { PageData } from './$types';

	type Repository = PageData['repos'][number];

	let { data } = $props<{ data: PageData }>();
	let query = $state('');

	function matchesQuery(repo: Repository, normalizedQuery: string): boolean {
		if (!normalizedQuery) {
			return true;
		}

		return [repo.full_name, repo.owner, repo.name, repo.description ?? '']
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
	}

	const normalizedQuery = $derived(query.trim().toLowerCase());
	const repoByName = $derived(
		new Map<string, Repository>(data.repos.map((repo: Repository) => [repo.full_name, repo]))
	);
	const recentRepos = $derived.by(() =>
		data.recentRepos
			.map((repo: PageData['recentRepos'][number]) => repoByName.get(repo.full_name))
			.filter((repo: Repository | undefined): repo is Repository => Boolean(repo))
	);
	const recentRepoNames = $derived(new Set(recentRepos.map((repo: Repository) => repo.full_name)));
	const filteredRecentRepos = $derived(
		recentRepos.filter((repo: Repository) => matchesQuery(repo, normalizedQuery))
	);
	const filteredRepos = $derived(
		data.repos.filter(
			(repo: Repository) =>
				!recentRepoNames.has(repo.full_name) && matchesQuery(repo, normalizedQuery)
		)
	);
	const hasResults = $derived(filteredRecentRepos.length > 0 || filteredRepos.length > 0);
	const returnTo = $derived(
		sanitizeAuthRedirectTarget(page.url.searchParams.get('returnTo'), '/repos')
	);
	const signInHref = $derived(
		buildPathWithQuery(resolve('/auth/login'), {
			redirect: returnTo
		})
	);
	let lastRoutingFailure = $state<Record<string, unknown> | null>(null);
	const devDiagnostics = $derived({
		url: `${page.url.pathname}${page.url.search}`,
		returnTo,
		debugFailure: page.url.searchParams.get('debugFailure'),
		debugRepo: page.url.searchParams.get('debugRepo'),
		isAuthenticated: page.data.isAuthenticated ?? false,
		selectedBackend: page.data.selectedBackend?.kind ?? null,
		selectedRepo: page.data.selectedRepo?.full_name ?? null,
		githubAuthenticated: data.githubAuthenticated,
		reposLoaded: data.repos.length,
		recentRepos: data.recentRepos.map((repo: PageData['recentRepos'][number]) => repo.full_name),
		lastRoutingFailure
	});

	onMount(() => {
		if (!dev) {
			return;
		}

		lastRoutingFailure = readLastRoutingFailure();
	});

	$effect(() => {
		if (!dev) {
			return;
		}

		logDevRouting('repos-page:state', devDiagnostics);
	});
</script>

<div class="mx-auto max-w-5xl">
	<div class="border border-stone-200 bg-white p-6 sm:p-8">
		<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">Repositories</p>
		<h1 class="mt-4 text-3xl font-black tracking-[-0.05em] text-stone-950 sm:text-4xl">
			Open a site repo
		</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
			Pick a repository to manage, or search to jump straight to the one you need.
		</p>

		{#if !data.githubAuthenticated}
			<div class="mt-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
				Sign in with GitHub to browse remote repositories. Local checkouts work without signing in.
				<div class="mt-3">
					{#if data.githubOAuthConfigured}
						<a
							href={signInHref}
							class="inline-flex min-h-10 items-center justify-center rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
						>
							Continue with GitHub
						</a>
					{:else}
						<span
							class="inline-flex min-h-10 items-center justify-center rounded-md bg-stone-300 px-4 text-sm font-semibold text-stone-700"
						>
							GitHub Login Unavailable
						</span>
					{/if}
				</div>
			</div>
		{/if}

		<div class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
			{#if data.githubAuthenticated}
				<label class="block">
					<span class="mb-2 block text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
						Search
					</span>
					<input
						bind:value={query}
						type="search"
						name="repo-search"
						placeholder="Search by owner, repo, or description"
						class="min-h-12 w-full border border-stone-300 px-4 text-sm text-stone-950 transition-colors outline-none placeholder:text-stone-400 focus:border-stone-950"
					/>
				</label>
			{:else}
				<div class="border border-stone-200 bg-stone-50 p-5">
					<h2 class="text-sm font-semibold tracking-[-0.02em] text-stone-950">
						Use a GitHub Repository
					</h2>
					<p class="mt-2 text-sm leading-6 text-stone-600">
						Connect GitHub when you want Tentman to browse your remote repos and publish changes
						back to them.
					</p>
				</div>
			{/if}

			<div class="border border-stone-200 bg-stone-50 p-5">
				<h2 class="text-sm font-semibold tracking-[-0.02em] text-stone-950">
					Open a Local Checkout
				</h2>
				<p class="mt-2 text-sm leading-6 text-stone-600">
					Skip the GitHub round-trip and edit a checked-out repository directly in Chromium.
				</p>
				<LocalRepoButton
					class="mt-4 inline-flex min-h-10 items-center justify-center border border-stone-300 px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-white"
				/>
			</div>
		</div>

		{#if dev}
			<details class="mt-6 border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
				<summary class="cursor-pointer font-semibold">Dev Diagnostics</summary>
				<p class="mt-2 text-xs text-sky-800">
					If the repo picker sends you back here, send me the values below plus any
					`[tentman:routing:dev]` lines from the dev server.
				</p>
				<pre class="mt-3 overflow-x-auto text-xs whitespace-pre-wrap">{JSON.stringify(
						devDiagnostics,
						null,
						2
					)}</pre>
			</details>
		{/if}
	</div>

	{#if !data.githubAuthenticated}{:else if data.repos.length === 0}
		<div class="mt-6 border border-yellow-200 bg-yellow-50 p-6 text-center">
			<p class="text-yellow-900">
				No repositories found. Create a repository on GitHub and add Tentman config files to get
				started.
			</p>
		</div>
	{:else if !hasResults}
		<div class="mt-6 border border-stone-200 bg-white p-8 text-center">
			<p class="text-lg font-semibold text-stone-950">No matching repositories</p>
			<p class="mt-2 text-sm text-stone-600">Try a different name, owner, or keyword.</p>
		</div>
	{:else}
		<div class="mt-6 space-y-6">
			{#if filteredRecentRepos.length > 0}
				<section>
					<div class="mb-3 flex items-end justify-between gap-4">
						<div>
							<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">Recent</p>
							<h2 class="mt-1 text-2xl font-bold tracking-[-0.04em] text-stone-950">
								Recently opened
							</h2>
						</div>
						<p class="text-sm text-stone-500">{filteredRecentRepos.length} repos</p>
					</div>

					<div class="grid gap-3">
						{#each filteredRecentRepos as repo}
							<RepositoryPickerCard {repo} />
						{/each}
					</div>
				</section>
			{/if}

			<section>
				<div class="mb-3 flex items-end justify-between gap-4">
					<div>
						<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
							{filteredRecentRepos.length > 0 ? 'All repos' : 'Repositories'}
						</p>
						<h2 class="mt-1 text-2xl font-bold tracking-[-0.04em] text-stone-950">
							{normalizedQuery ? 'Search results' : 'Browse repositories'}
						</h2>
					</div>
					<p class="text-sm text-stone-500">{filteredRepos.length} repos</p>
				</div>

				<div class="grid gap-3">
					{#each filteredRepos as repo}
						<RepositoryPickerCard {repo} />
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>
