<script lang="ts">
	import { githubCacheWarmDebugStatus } from '$lib/stores/github-repository-cache';

	const progressPercent = $derived.by(() => {
		if ($githubCacheWarmDebugStatus.totalTasks <= 0) {
			return 0;
		}

		return Math.round(
			Math.min(
				1,
				$githubCacheWarmDebugStatus.completedTasks / $githubCacheWarmDebugStatus.totalTasks
			) * 100
		);
	});
	const taskKindRows = $derived(
		Object.entries($githubCacheWarmDebugStatus.taskKinds).filter(
			([, counts]) =>
				counts.total > 0 ||
				counts.completed > 0 ||
				counts.error > 0 ||
				counts.queued > 0 ||
				counts.running > 0
		)
	);
</script>

<div class="grid gap-5">
	<section class="border-b border-stone-200 pb-5">
		<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">GitHub cache</p>
		<h1 class="mt-2 text-3xl font-black text-stone-950">Cache progress</h1>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			Inspect the active repository cache warmup queue and stored progress for this workspace.
		</p>
	</section>

	<section class="grid gap-3 rounded-md border border-stone-200 bg-white p-4">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Status</p>
				<h2 class="mt-1 text-xl font-bold text-stone-950">
					{$githubCacheWarmDebugStatus.message ?? $githubCacheWarmDebugStatus.phase}
				</h2>
			</div>
			<p class="font-mono text-sm text-stone-600">
				{$githubCacheWarmDebugStatus.completedTasks}/{$githubCacheWarmDebugStatus.totalTasks}
				tasks
			</p>
		</div>

		<div class="h-2 overflow-hidden rounded-full bg-stone-200">
			<span class="block h-full rounded-full bg-stone-950" style={`width: ${progressPercent}%`}></span>
		</div>

		{#if $githubCacheWarmDebugStatus.error}
			<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
				{$githubCacheWarmDebugStatus.error}
			</p>
		{/if}
	</section>

	<section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Collections</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheWarmDebugStatus.warmedCollections}/{$githubCacheWarmDebugStatus.totalCollections}
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Projected items</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheWarmDebugStatus.hydratedItems}/{$githubCacheWarmDebugStatus.totalItems}
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Queue</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheWarmDebugStatus.queuedTasks} queued
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Running</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheWarmDebugStatus.runningTasks}
			</p>
		</div>
	</section>

	<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="overflow-hidden rounded-md border border-stone-200 bg-white">
			<table class="w-full text-left text-sm">
				<thead class="bg-stone-50 text-xs font-semibold tracking-[0.16em] text-stone-500 uppercase">
					<tr>
						<th class="px-4 py-3">Kind</th>
						<th class="px-4 py-3">Total</th>
						<th class="px-4 py-3">Queued</th>
						<th class="px-4 py-3">Running</th>
						<th class="px-4 py-3">Done</th>
						<th class="px-4 py-3">Error</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200">
					{#each taskKindRows as [kind, counts] (kind)}
						<tr>
							<td class="px-4 py-3 font-mono text-xs text-stone-700">{kind}</td>
							<td class="px-4 py-3 text-stone-700">{counts.total}</td>
							<td class="px-4 py-3 text-stone-700">{counts.queued}</td>
							<td class="px-4 py-3 text-stone-700">{counts.running}</td>
							<td class="px-4 py-3 text-stone-700">{counts.completed}</td>
							<td class="px-4 py-3 text-stone-700">{counts.error}</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="px-4 py-6 text-center text-sm text-stone-500">
								No cache tasks are active yet.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="grid content-start gap-3 rounded-md border border-stone-200 bg-white p-4">
			<div>
				<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Identity</p>
				<dl class="mt-3 grid gap-2 text-sm">
					<div>
						<dt class="text-stone-500">Repository</dt>
						<dd class="font-mono text-xs text-stone-800">
							{$githubCacheWarmDebugStatus.activeRepoFullName ?? 'None'}
						</dd>
					</div>
					<div>
						<dt class="text-stone-500">Ref</dt>
						<dd class="font-mono text-xs text-stone-800">
							{$githubCacheWarmDebugStatus.activeRef ?? 'None'}
						</dd>
					</div>
					<div>
						<dt class="text-stone-500">Tree</dt>
						<dd class="break-all font-mono text-xs text-stone-800">
							{$githubCacheWarmDebugStatus.activeTreeSha ?? 'None'}
						</dd>
					</div>
				</dl>
			</div>

			<div>
				<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Current work</p>
				<p class="mt-2 text-sm text-stone-700">
					Running: {$githubCacheWarmDebugStatus.runningTaskKind ?? 'none'}
				</p>
				<p class="mt-1 text-sm text-stone-700">
					Pending:
					{$githubCacheWarmDebugStatus.pendingTaskKinds.length > 0
						? $githubCacheWarmDebugStatus.pendingTaskKinds.join(', ')
						: 'none'}
				</p>
				{#if $githubCacheWarmDebugStatus.pendingTaskKeys.length > 0}
					<ul class="mt-2 grid gap-1">
						{#each $githubCacheWarmDebugStatus.pendingTaskKeys.slice(0, 8) as taskKey (taskKey)}
							<li class="break-all font-mono text-[11px] text-stone-500">{taskKey}</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</section>
</div>
