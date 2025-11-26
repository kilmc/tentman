<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
</script>

<div class="mx-auto max-w-3xl py-16 text-center">
	<h1 class="mb-4 text-5xl font-bold text-gray-900">Welcome to Tentman CMS</h1>
	<p class="mb-8 text-xl text-gray-600">A Git-based content management system for static sites</p>

	{#if !data.isAuthenticated}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">Get Started</h2>
			<p class="mb-6 text-gray-600">
				Login with your GitHub account to manage content for your repositories
			</p>
			<a
				href="/auth/login"
				class="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				Login with GitHub
			</a>
		</div>
	{:else if !data.selectedRepo}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">Select a Repository</h2>
			<p class="mb-6 text-gray-600">Choose a repository to start managing content</p>
			<a
				href="/repos"
				class="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				Select Repository
			</a>
		</div>
	{:else}
		<div class="mb-8 rounded-lg bg-white p-8 shadow-md">
			<h2 class="mb-4 text-2xl font-semibold">You're all set!</h2>
			<p class="mb-6 text-gray-600">
				Managing content for <span class="font-semibold">{data.selectedRepo.full_name}</span>
			</p>
			<a
				href="/pages"
				class="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				View Content
			</a>
		</div>
	{/if}

	<div class="mt-12 text-left">
		<h3 class="mb-4 text-lg font-semibold">Current Implementation Status</h3>
		<div class="space-y-3 rounded-lg bg-gray-50 p-6">
			<div class="flex items-center gap-3">
				<span class="font-bold text-green-600">✓</span>
				<span>Phase 1: GitHub Authentication & Repo Connection</span>
			</div>
			<div class="flex items-center gap-3">
				<span class="font-bold text-green-600">✓</span>
				<span>Phase 2: Config Discovery & Parsing</span>
			</div>
			<div class="flex items-center gap-3">
				<span class="font-bold text-gray-400">○</span>
				<span class="text-gray-600">Phase 3: Content Fetching & Display</span>
			</div>
		</div>
	</div>
</div>
