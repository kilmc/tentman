<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LocalRepoButton from '$lib/components/LocalRepoButton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const githubOAuthUnavailable = $derived(
		!data.githubOAuthConfigured || page.url.searchParams.get('github_oauth') === 'unavailable'
	);
	const githubOAuthRetryLater = $derived(
		page.url.searchParams.get('github_oauth') === 'retry_later'
	);
</script>

<section class="flex min-h-screen items-center px-6 py-16 sm:px-10">
	<div class="mx-auto w-full max-w-4xl border border-stone-200 bg-white p-8 sm:p-12 lg:p-16">
		{#if githubOAuthUnavailable}
			<div class="mb-8 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
				GitHub login is not configured for this local deployment. Set
				<code class="rounded bg-amber-100 px-1">GITHUB_CLIENT_ID</code>
				and
				<code class="rounded bg-amber-100 px-1">GITHUB_CLIENT_SECRET</code>
				to enable OAuth.
			</div>
		{/if}

		{#if githubOAuthRetryLater}
			<div class="mb-8 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
				GitHub sign-in was triggered repeatedly, so Tentman paused new auth requests for a few
				seconds to avoid another redirect storm. Wait a moment, then try again.
			</div>
		{/if}

		<p class="text-xs font-semibold tracking-[0.28em] text-stone-500 uppercase">Tentman</p>
		<h1 class="mt-6 max-w-3xl text-4xl font-black tracking-[-0.06em] text-stone-950 sm:text-6xl">
			Tentman, a simple way to manage your site.
		</h1>
		<p class="mt-5 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
			Sign in with GitHub to open a repository, or skip GitHub and work directly against a local
			checkout in Chromium.
		</p>

		<div class="mt-10 flex flex-wrap gap-3">
			{#if data.githubOAuthConfigured}
				<a
					href={resolve('/repos')}
					class="inline-flex min-h-12 items-center justify-center rounded-md bg-stone-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
				>
					Use GitHub Repos
				</a>
			{:else}
				<span
					class="inline-flex min-h-12 items-center justify-center rounded-md bg-stone-300 px-6 text-sm font-semibold text-stone-700"
				>
					GitHub Login Unavailable
				</span>
			{/if}

			<LocalRepoButton
				label="Open a Local Repo"
				class="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 px-6 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
			/>
		</div>

		<p class="mt-12 text-xs tracking-[0.2em] text-stone-400 uppercase">
			Repository-first editing for Tentman sites
		</p>
	</div>
</section>
