<script lang="ts">
	import type { PageData } from './$types';
	import LocalRepoButton from '$lib/components/LocalRepoButton.svelte';

	let { data } = $props<{ data: PageData }>();
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<h1 class="mb-2 text-3xl font-bold tracking-[-0.03em] text-stone-950">Select a Repository</h1>
		<p class="text-stone-600">
			Choose a repository to manage content. The CMS will discover configuration files and display
			editable sections.
		</p>
	</div>

	<div class="mb-6 rounded-md border border-stone-200 bg-white p-5">
		<h2 class="mb-2 text-lg font-semibold text-stone-950">Open a Local Checkout</h2>
		<p class="mb-4 text-sm text-stone-600">
			Skip the GitHub round-trip and edit a checked-out repository directly in Chromium.
		</p>
		<LocalRepoButton
			class="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
		/>
	</div>

	{#if data.repos.length === 0}
		<div class="rounded-md border border-yellow-200 bg-yellow-50 p-6 text-center">
			<p class="text-yellow-900">
				No repositories found. Create a repository on GitHub and add Tentman config files to get
				started.
			</p>
		</div>
	{:else}
		<div class="grid gap-3">
			{#each data.repos as repo}
				<form method="POST" action="?/select" class="block">
					<input type="hidden" name="owner" value={repo.owner} />
					<input type="hidden" name="name" value={repo.name} />

					<button
						type="submit"
						class="w-full rounded-md border border-stone-200 bg-white p-5 text-left transition-colors hover:border-stone-400 hover:bg-stone-50"
					>
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="mb-2 flex items-center gap-2">
									<h3 class="text-lg font-semibold text-stone-950">{repo.full_name}</h3>
									{#if repo.private}
										<span
											class="rounded-sm bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700"
										>
											Private
										</span>
									{/if}
								</div>
								{#if repo.description}
									<p class="mb-2 text-sm text-stone-600">{repo.description}</p>
								{/if}
								<p class="text-xs text-stone-500">
									Updated {new Date(repo.updated_at).toLocaleDateString()}
								</p>
							</div>
							<div class="ml-4">
								<svg
									class="h-5 w-5 text-stone-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</div>
						</div>
					</button>
				</form>
			{/each}
		</div>
	{/if}
</div>
