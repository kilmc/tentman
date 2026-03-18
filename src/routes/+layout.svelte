<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { draftBranch } from '$lib/stores/draft-branch';
	import { localRepo } from '$lib/stores/local-repo';
	import LocalRepoButton from '$lib/components/LocalRepoButton.svelte';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	onMount(async () => {
		await localRepo.hydrate();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Enable hover prefetch globally for instant navigation -->
<div class="min-h-screen bg-gray-50" data-sveltekit-preload-data="hover">
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between">
				<div class="flex items-center gap-8">
					<a href="/" class="text-xl font-bold text-gray-900">Tentman CMS</a>

					<nav class="flex items-center gap-4">
						<a href="/docs" class="text-sm text-gray-700 hover:text-gray-900 hover:underline">
							Docs
						</a>
						{#if data.selectedBackend}
							<a href="/pages" class="text-sm text-gray-700 hover:text-gray-900 hover:underline">
								Content
							</a>
						{/if}
					</nav>

					{#if data.selectedBackend?.kind === 'github' && data.selectedRepo}
						<div class="flex items-center gap-2 text-sm">
							<span class="text-gray-500">Repository:</span>
							<span class="font-medium text-gray-900">{data.selectedRepo.full_name}</span>
							<a
								href="/repos"
								class="ml-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
								title="Change repository"
							>
								Change
							</a>
						</div>
					{:else if data.selectedBackend?.kind === 'local'}
						<div class="flex items-center gap-2 text-sm">
							<span class="text-gray-500">Local Repo:</span>
							<span class="font-medium text-gray-900">{data.selectedBackend.repo.name}</span>
							<LocalRepoButton
								label="Change"
								class="ml-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
							/>
						</div>
					{/if}
				</div>

				<div class="flex items-center gap-4">
					{#if data.selectedBackend?.kind === 'local'}
						<LocalRepoButton
							label="Open Local Repo"
							class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
						/>
						<button
							type="button"
							class="text-sm text-gray-600 hover:text-gray-900 hover:underline"
							onclick={() => localRepo.clear()}
						>
							Close Local Repo
						</button>
					{:else if data.isAuthenticated && data.user}
						{#if $draftBranch.branchName}
							<a
								href="/publish"
								class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
							>
								Publish Changes
							</a>
						{/if}

						<div class="flex items-center gap-3">
							<img src={data.user.avatar_url} alt={data.user.login} class="h-8 w-8 rounded-full" />
							<span class="text-sm font-medium text-gray-700">{data.user.login}</span>
							<a
								href="/auth/logout"
								class="text-sm text-gray-600 hover:text-gray-900 hover:underline"
							>
								Logout
							</a>
						</div>
					{:else}
						<div class="flex items-center gap-3">
							<LocalRepoButton
								class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
							/>
							<a
								href="/auth/login"
								class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
							>
								Login with GitHub
							</a>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		{@render children?.()}
	</main>

	<ToastContainer />
</div>
