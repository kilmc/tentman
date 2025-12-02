<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import type { LayoutData } from './$types';
	import { onMount } from 'svelte';
	import { draftBranch } from '$lib/stores/draft-branch';

	let { children, data } = $props<{ children?: any; data: LayoutData }>();

	// Initialize draft branch on mount
	onMount(async () => {
		if (data.isAuthenticated && data.selectedRepo && data.octokit) {
			const { owner, name } = data.selectedRepo;
			await draftBranch.initialize(data.octokit, owner, name);
		}
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
						{#if data.selectedRepo}
							<a href="/pages" class="text-sm text-gray-700 hover:text-gray-900 hover:underline">
								Content
							</a>
						{/if}
					</nav>

					{#if data.selectedRepo}
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
					{/if}
				</div>

				<div class="flex items-center gap-4">
					{#if data.isAuthenticated && data.user}
						<!-- Publish Changes button (only visible when draft exists) -->
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
						<a
							href="/auth/login"
							class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
						>
							Login with GitHub
						</a>
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
