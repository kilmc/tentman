<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import LocalRepoButton from '$lib/components/LocalRepoButton.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const siteName =
		data.rootConfig?.siteName ??
		(data.selectedBackend?.kind === 'local'
			? data.selectedBackend.repo.name
			: data.selectedRepo?.name);
</script>

<div class="mx-auto max-w-3xl py-14 text-center">
	<h1 class="mb-3 text-5xl font-bold tracking-[-0.04em] text-stone-950">
		{siteName ? `Manage ${siteName}` : 'Manage Your Site'}
	</h1>
	<p class="mb-8 text-lg text-stone-600">Open your content workspace and start editing.</p>

	{#if !data.selectedBackend && !data.isAuthenticated}
		<div class="mb-8 rounded-md border border-stone-200 bg-white p-6">
			<h2 class="mb-3 text-2xl font-semibold text-stone-950">Get Started</h2>
			<p class="mb-6 text-stone-600">
				Login with GitHub or open a local repository to manage content
			</p>
			<div class="flex items-center justify-center gap-4">
				<LocalRepoButton
					class="inline-block rounded-md border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
				/>
				<a
					href={resolve('/auth/login')}
					class="inline-block rounded-md bg-stone-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
				>
					Login with GitHub
				</a>
			</div>
		</div>
	{:else if data.selectedBackend?.kind === 'local'}
		<div class="mb-8 rounded-md border border-stone-200 bg-white p-6">
			<h2 class="mb-3 text-2xl font-semibold text-stone-950">
				{siteName ?? 'Local repository'} is ready
			</h2>
			<p class="mb-6 text-stone-600">
				Editing files directly inside <span class="font-semibold"
					>{data.selectedBackend.repo.name}</span
				>
			</p>
			<a
				href={resolve('/pages')}
				class="inline-block rounded-md bg-stone-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
			>
				Open CMS
			</a>
		</div>
	{:else if !data.selectedRepo}
		<div class="mb-8 rounded-md border border-stone-200 bg-white p-6">
			<h2 class="mb-3 text-2xl font-semibold text-stone-950">Select a Repository</h2>
			<p class="mb-6 text-stone-600">Choose a repository to start managing content</p>
			<a
				href={resolve('/repos')}
				class="inline-block rounded-md bg-stone-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
			>
				Select Repository
			</a>
		</div>
	{:else}
		<div class="mb-8 rounded-md border border-stone-200 bg-white p-6">
			<h2 class="mb-3 text-2xl font-semibold text-stone-950">{siteName ?? 'Your site'} is ready</h2>
			<p class="mb-6 text-stone-600">
				Managing content for <span class="font-semibold">{data.selectedRepo.full_name}</span>
			</p>
			<a
				href={resolve('/pages')}
				class="inline-block rounded-md bg-stone-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
			>
				Open CMS
			</a>
		</div>
	{/if}
</div>
