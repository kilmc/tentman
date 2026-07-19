<script lang="ts">
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import {
		githubCacheInventoryStatus,
		githubCacheWorkObservabilityStatus,
		githubRepositoryCache,
		type GithubCacheCurrentWorkState,
		type GithubCacheInventoryRecord,
		type GithubCacheWorkHistoryRecord
	} from '$lib/stores/github-repository-cache';
	import type { CacheWorkOperation } from '$lib/utils/workflow-instrumentation';

	let refreshing = $state<string | null>(null);

	const progressPercent = $derived.by(() => {
		if ($githubCacheInventoryStatus.totalTargets <= 0) {
			return 0;
		}

		return Math.round(
			Math.min(
				1,
				($githubCacheInventoryStatus.cachedTargets +
					$githubCacheInventoryStatus.skippedBudgetTargets) /
					$githubCacheInventoryStatus.totalTargets
			) * 100
		);
	});
	const visibleRecords = $derived($githubCacheInventoryStatus.records);
	const hasErrors = $derived($githubCacheInventoryStatus.errorTargets > 0);
	const isInventoryRefreshing = $derived($githubCacheInventoryStatus.refreshingTargets > 0);
	const currentWork = $derived($githubCacheWorkObservabilityStatus.current);
	const recentWork = $derived($githubCacheWorkObservabilityStatus.recent);

	function formatBytes(bytes: number | null) {
		if (!bytes) {
			return '—';
		}

		if (bytes < 1024) {
			return `${bytes} B`;
		}

		if (bytes < 1024 * 1024) {
			return `${(bytes / 1024).toFixed(1)} KB`;
		}

		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function formatDate(timestamp: number | null) {
		if (!timestamp) {
			return '—';
		}

		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(timestamp);
	}

	function formatDuration(durationMs: number) {
		if (durationMs < 1000) {
			return `${durationMs}ms`;
		}

		return `${(durationMs / 1000).toFixed(1)}s`;
	}

	function shortSha(value: string | null) {
		return value ? value.slice(0, 10) : '—';
	}

	function getOperationLabel(operation: CacheWorkOperation) {
		const labels: Record<CacheWorkOperation, string> = {
			'projection-hydration': 'Projection hydration',
			'item-document-warming': 'Item-document warming',
			'full-document-warming': 'Full-document warming',
			'block-support-warming': 'Block support warming',
			'singleton-document-warming': 'Singleton document warming',
			'collection-index-warming': 'Collection index warming',
			freshness: 'Freshness',
			'retry-backoff': 'Retry/backoff',
			'rate-limit-pause': 'Rate-limit pause',
			'queue-wait': 'Queue wait',
			'indexeddb-write': 'IndexedDB write',
			'no-active-work': 'No active work'
		};

		return labels[operation];
	}

	function getStateLabel(state: GithubCacheCurrentWorkState) {
		const labels: Record<GithubCacheCurrentWorkState, string> = {
			idle: 'Idle',
			queued: 'Queued',
			running: 'Running',
			'waiting-for-idle': 'Waiting for idle',
			'blocked-by-foreground': 'Blocked by foreground work',
			'backing-off': 'Backing off',
			paused: 'Paused',
			'rate-limited': 'Rate limited',
			completed: 'Completed',
			error: 'Error'
		};

		return labels[state];
	}

	function getStateClass(state: GithubCacheCurrentWorkState) {
		if (state === 'running') {
			return 'border-blue-200 bg-blue-50 text-blue-800';
		}
		if (state === 'backing-off' || state === 'waiting-for-idle' || state === 'queued') {
			return 'border-amber-200 bg-amber-50 text-amber-800';
		}
		if (state === 'rate-limited' || state === 'paused' || state === 'error') {
			return 'border-red-200 bg-red-50 text-red-800';
		}
		if (state === 'completed') {
			return 'border-emerald-200 bg-emerald-50 text-emerald-800';
		}
		return 'border-stone-200 bg-stone-100 text-stone-700';
	}

	function getHistoryResultClass(result: GithubCacheWorkHistoryRecord['result']) {
		if (result === 'completed') {
			return 'text-emerald-700';
		}
		if (result === 'error' || result === 'paused') {
			return 'text-red-700';
		}
		return 'text-stone-600';
	}

	function getStatusClass(status: GithubCacheInventoryRecord['status']) {
		if (status === 'fresh') {
			return 'border-emerald-200 bg-emerald-50 text-emerald-800';
		}
		if (status === 'error') {
			return 'border-red-200 bg-red-50 text-red-800';
		}
		if (status === 'refreshing') {
			return 'border-blue-200 bg-blue-50 text-blue-800';
		}
		if (status === 'skipped-budget') {
			return 'border-amber-200 bg-amber-50 text-amber-800';
		}
		return 'border-stone-200 bg-stone-100 text-stone-700';
	}

	function getStatusTitle(record: GithubCacheInventoryRecord) {
		if (record.error) {
			return record.error;
		}

		if (record.status === 'refreshing') {
			return 'Refresh in progress';
		}

		if (record.status === 'skipped-budget') {
			return 'Skipped by the active full-document cache budget';
		}

		return record.status;
	}

	async function refreshAll() {
		refreshing = 'all';
		try {
			await githubRepositoryCache.refreshInventory({ fetcher: fetch, scope: 'all' });
		} finally {
			refreshing = null;
		}
	}

	async function refreshStale() {
		refreshing = 'stale';
		try {
			await githubRepositoryCache.refreshInventory({ fetcher: fetch, scope: 'stale' });
		} finally {
			refreshing = null;
		}
	}

	async function refreshTarget(record: GithubCacheInventoryRecord) {
		refreshing = record.targetId;
		try {
			await githubRepositoryCache.refreshInventoryTarget({
				targetId: record.targetId,
				fetcher: fetch
			});
		} finally {
			refreshing = null;
		}
	}

	async function clearActiveCache() {
		if (!$githubCacheInventoryStatus.repoFullName || !$githubCacheInventoryStatus.activeRef) {
			return;
		}

		refreshing = 'clear';
		try {
			await githubRepositoryCache.clearRepoRef({
				repoFullName: $githubCacheInventoryStatus.repoFullName,
				ref: $githubCacheInventoryStatus.activeRef
			});
		} finally {
			refreshing = null;
		}
	}
</script>

<div class="grid gap-5">
	<section class="grid gap-4 border-b border-stone-200 pb-5 xl:grid-cols-[minmax(0,1fr)_auto]">
		<div>
			<p class="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">GitHub cache</p>
			<h1 class="mt-2 text-3xl font-black text-stone-950">Cache inventory</h1>
			<dl class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600">
				<div>
					<dt class="font-semibold text-stone-500">Repo</dt>
					<dd class="font-mono">{$githubCacheInventoryStatus.repoFullName ?? 'None'}</dd>
				</div>
				<div>
					<dt class="font-semibold text-stone-500">Ref</dt>
					<dd class="font-mono">{$githubCacheInventoryStatus.activeRef ?? 'None'}</dd>
				</div>
				<div>
					<dt class="font-semibold text-stone-500">Tree</dt>
					<dd class="font-mono">{shortSha($githubCacheInventoryStatus.activeTreeSha)}</dd>
				</div>
				<div>
					<dt class="font-semibold text-stone-500">Checked</dt>
					<dd>{formatDate($githubCacheInventoryStatus.lastCheckedAt)}</dd>
				</div>
			</dl>
		</div>

		<div class="flex flex-wrap items-start gap-2">
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
				disabled={refreshing !== null}
				onclick={() => void refreshStale()}
			>
				<RefreshCw class="size-4" />
				Refresh stale
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
				disabled={refreshing !== null}
				onclick={() => void refreshAll()}
			>
				<RefreshCw class="size-4" />
				Refresh all
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
				disabled={refreshing !== null}
				onclick={() => void clearActiveCache()}
			>
				<Trash2 class="size-4" />
				Clear cache
			</button>
		</div>
	</section>

	<section class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Cached</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheInventoryStatus.cachedTargets}/{$githubCacheInventoryStatus.totalTargets}
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Stale</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheInventoryStatus.staleTargets + $githubCacheInventoryStatus.missingTargets}
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Errors</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheInventoryStatus.errorTargets}
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Storage</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{formatBytes($githubCacheInventoryStatus.storageBytes)}
			</p>
		</div>
		<div class="rounded-md border border-stone-200 bg-white p-4">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Docs</p>
			<p class="mt-2 text-2xl font-bold text-stone-950">
				{$githubCacheInventoryStatus.documentRecords}/{$githubCacheInventoryStatus.documentRecordLimit}
			</p>
		</div>
	</section>

	<section class="grid gap-2">
		<div class="h-2 overflow-hidden rounded-full bg-stone-200">
			<span class="block h-full rounded-full bg-stone-950" style={`width: ${progressPercent}%`}></span>
		</div>
		<p class="text-xs text-stone-600">{$githubCacheWorkObservabilityStatus.progressExplanation}</p>
		<p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
			<span>Full document budget: {formatBytes($githubCacheInventoryStatus.documentBudgetBytes)}</span>
			{#if $githubCacheInventoryStatus.budgetLimited}
				<span class="font-semibold text-amber-700">Budget limited</span>
			{/if}
			{#if isInventoryRefreshing}
				<span class="font-semibold text-blue-700">
					{$githubCacheInventoryStatus.refreshingTargets} refreshing
				</span>
			{/if}
			{#if hasErrors}
				<span class="font-semibold text-red-700">
					{$githubCacheInventoryStatus.errorTargets} error{$githubCacheInventoryStatus.errorTargets === 1 ? '' : 's'}
				</span>
			{/if}
		</p>
	</section>

	<section class="grid gap-3 rounded-md border border-stone-200 bg-white p-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="grid gap-1">
				<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
					Current work
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<span
						class={`rounded-full border px-2 py-1 text-xs font-semibold ${getStateClass(currentWork.state)}`}
					>
						{getStateLabel(currentWork.state)}
					</span>
					<span class="font-mono text-xs text-stone-600">
						{getOperationLabel(currentWork.operation)}
					</span>
				</div>
				<p class="text-base font-semibold text-stone-950">{currentWork.label}</p>
				{#if currentWork.route}
					<p class="font-mono text-xs text-stone-500">{currentWork.route}</p>
				{/if}
				{#if currentWork.reason}
					<p class="text-sm text-stone-600">{currentWork.reason}</p>
				{/if}
			</div>

			<dl class="grid grid-cols-3 gap-3 text-right text-xs text-stone-600">
				<div>
					<dt class="font-semibold text-stone-500">Progress</dt>
					<dd class="font-mono text-stone-900">
						{currentWork.progressCompleted}/{currentWork.progressTotal}
					</dd>
				</div>
				<div>
					<dt class="font-semibold text-stone-500">Queued</dt>
					<dd class="font-mono text-stone-900">
						{currentWork.queuedTasks} queued
					</dd>
				</div>
				<div>
					<dt class="font-semibold text-stone-500">Active</dt>
					<dd class="font-mono text-stone-900">
						{currentWork.runningTasks} active
					</dd>
				</div>
			</dl>
		</div>

		<div class="border-t border-stone-200 pt-3">
			<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Recent work</p>
			{#if recentWork.length > 0}
				<ul class="mt-2 grid gap-2">
					{#each recentWork as record (record.id)}
						<li class="grid gap-1 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
							<div class="min-w-0">
								<p class="truncate font-semibold text-stone-900">{record.label}</p>
								<p class="font-mono text-xs text-stone-500">
									{getOperationLabel(record.operation)}
									{#if record.route}
										<span class="text-stone-400"> · {record.route}</span>
									{/if}
								</p>
								{#if record.reason}
									<p class="text-xs text-stone-600">{record.reason}</p>
								{/if}
							</div>
							<p class="font-mono text-xs">
								<span class={getHistoryResultClass(record.result)}>{record.result}</span>
								<span class="text-stone-400"> · {formatDuration(record.durationMs)}</span>
							</p>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-2 text-sm text-stone-500">No recent cache work for this workspace.</p>
			{/if}
		</div>
	</section>

	<section class="overflow-hidden rounded-md border border-stone-200 bg-white">
		<table class="w-full text-left text-sm">
			<thead class="bg-stone-50 text-xs font-semibold tracking-[0.16em] text-stone-500 uppercase">
				<tr>
					<th class="px-4 py-3">Label</th>
					<th class="px-4 py-3">Type</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Path</th>
					<th class="px-4 py-3">Identity</th>
					<th class="px-4 py-3">Size</th>
					<th class="px-4 py-3">Cached</th>
					<th class="px-4 py-3 text-right">Action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-stone-200">
				{#each visibleRecords as record (record.key)}
					<tr>
						<td class="max-w-56 px-4 py-3 font-semibold text-stone-900">{record.label}</td>
						<td class="px-4 py-3 font-mono text-xs text-stone-600">{record.targetType}</td>
						<td class="px-4 py-3">
							<span
								class={`rounded-full border px-2 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}
								title={getStatusTitle(record)}
							>
								{record.status}
							</span>
							{#if record.error}
								<p class="mt-1 max-w-48 truncate text-xs text-red-700" title={record.error}>
									{record.error}
								</p>
							{/if}
						</td>
						<td class="max-w-72 truncate px-4 py-3 font-mono text-xs text-stone-600">
							{record.path ?? '—'}
						</td>
						<td class="px-4 py-3 font-mono text-xs text-stone-600">
							{shortSha(record.blobSha ?? record.dependencyIdentity)}
						</td>
						<td class="px-4 py-3 text-stone-700">{formatBytes(record.estimatedBytes)}</td>
						<td class="px-4 py-3 text-stone-700">{formatDate(record.lastCachedAt)}</td>
						<td class="px-4 py-3 text-right">
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-md border border-stone-300 p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-50"
								aria-label={`Refresh ${record.label}`}
								disabled={refreshing !== null || record.targetType === 'snapshot'}
								onclick={() => void refreshTarget(record)}
							>
								<RefreshCw class="size-4" />
							</button>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="px-4 py-8 text-center text-sm text-stone-500">
							No cache inventory is available for the active workspace.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>
