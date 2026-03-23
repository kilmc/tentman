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

<div class="mx-auto max-w-3xl py-16 text-center">
	<h1 class="mb-4 text-5xl font-bold text-gray-900">
		{siteName ? `Manage ${siteName}` : 'Manage Your Site'}
	</h1>
	<p class="mb-8 text-xl text-gray-600">Open your content workspace and start editing.</p>

	{#if !data.selectedBackend && !data.isAuthenticated}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">Get Started</h2>
			<p class="mb-6 text-gray-600">
				Login with GitHub or open a local repository to manage content
			</p>
			<div class="flex items-center justify-center gap-4">
				<LocalRepoButton
					class="inline-block rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
				/>
				<a
					href={resolve('/auth/login')}
					class="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
				>
					Login with GitHub
				</a>
			</div>
		</div>
	{:else if data.selectedBackend?.kind === 'local'}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">{siteName ?? 'Local repository'} is ready</h2>
			<p class="mb-6 text-gray-600">
				Editing files directly inside <span class="font-semibold"
					>{data.selectedBackend.repo.name}</span
				>
			</p>
			<a
				href={resolve('/pages')}
				class="inline-block rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700"
			>
				View Content
			</a>
		</div>
	{:else if !data.selectedRepo}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">Select a Repository</h2>
			<p class="mb-6 text-gray-600">Choose a repository to start managing content</p>
			<a
				href={resolve('/repos')}
				class="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				Select Repository
			</a>
		</div>
	{:else}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">{siteName ?? 'Your site'} is ready</h2>
			<p class="mb-6 text-gray-600">
				Managing content for <span class="font-semibold">{data.selectedRepo.full_name}</span>
			</p>
			<a
				href={resolve('/pages')}
				class="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				View Content
			</a>
		</div>
	{/if}
</div>
