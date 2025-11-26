<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-8">
		<h1 class="mb-2 text-3xl font-bold text-gray-900">Select a Repository</h1>
		<p class="text-gray-600">
			Choose a repository to manage content. The CMS will discover configuration files and display
			available content types.
		</p>
	</div>

	{#if data.repos.length === 0}
		<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
			<p class="text-yellow-800">
				No repositories found. Create a repository on GitHub and add Tentman config files to get
				started.
			</p>
		</div>
	{:else}
		<div class="grid gap-4">
			{#each data.repos as repo}
				<form method="POST" action="?/select" class="block">
					<input type="hidden" name="owner" value={repo.owner} />
					<input type="hidden" name="name" value={repo.name} />

					<button
						type="submit"
						class="w-full rounded-lg border border-gray-200 bg-white p-6 text-left transition-all hover:border-blue-500 hover:shadow-md"
					>
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="mb-2 flex items-center gap-2">
									<h3 class="text-lg font-semibold text-gray-900">{repo.full_name}</h3>
									{#if repo.private}
										<span
											class="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
										>
											Private
										</span>
									{/if}
								</div>
								{#if repo.description}
									<p class="mb-2 text-sm text-gray-600">{repo.description}</p>
								{/if}
								<p class="text-xs text-gray-500">
									Updated {new Date(repo.updated_at).toLocaleDateString()}
								</p>
							</div>
							<div class="ml-4">
								<svg
									class="h-6 w-6 text-gray-400"
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
