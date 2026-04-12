<script lang="ts">
	interface RepositoryCard {
		owner: string;
		name: string;
		full_name: string;
		description: string | null;
		private: boolean;
		updated_at: string;
	}

	let { repo }: { repo: RepositoryCard } = $props();
</script>

<form method="POST" action="?/select" class="block">
	<input type="hidden" name="owner" value={repo.owner} />
	<input type="hidden" name="name" value={repo.name} />

	<button
		type="submit"
		class="w-full border border-stone-200 bg-white p-5 text-left transition-colors hover:border-stone-400 hover:bg-stone-50"
	>
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<h3 class="text-lg font-semibold text-stone-950">{repo.full_name}</h3>
					{#if repo.private}
						<span class="bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">Private</span>
					{/if}
				</div>

				{#if repo.description}
					<p class="mb-2 text-sm text-stone-600">{repo.description}</p>
				{/if}

				<p class="text-xs text-stone-500">
					Updated {new Date(repo.updated_at).toLocaleDateString()}
				</p>
			</div>

			<svg
				class="mt-0.5 h-5 w-5 shrink-0 text-stone-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</div>
	</button>
</form>
