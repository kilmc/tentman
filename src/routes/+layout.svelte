<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from './$types';

	let { children, data } = $props<{ children?: any; data: LayoutData }>();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between">
				<div class="flex items-center gap-8">
					<a href="/" class="text-xl font-bold text-gray-900">Tentman CMS</a>

					{#if data.selectedRepo}
						<nav class="flex items-center gap-4">
							<a href="/pages" class="text-sm text-gray-700 hover:text-gray-900 hover:underline">
								Content
							</a>
						</nav>
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
</div>
