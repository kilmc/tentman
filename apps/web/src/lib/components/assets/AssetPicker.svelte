<script lang="ts">
	import { tick } from 'svelte';
	import FileIcon from 'lucide-svelte/icons/file';
	import FileAudio from 'lucide-svelte/icons/file-audio';
	import FileText from 'lucide-svelte/icons/file-text';
	import FileVideo from 'lucide-svelte/icons/file-video';
	import AssetImage from '$lib/components/AssetImage.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import {
		hasAssetPickerConfig,
		type AssetPickerConfig,
		type AssetPickerEntry,
		type AssetPickerFilter
	} from '$lib/features/assets/asset-picker';
	import { loadAssetPickerEntriesForMode } from '$lib/features/assets/asset-picker-browser';

	interface UploadResult {
		value: string;
		previewUrl?: string | null;
	}

	interface Props {
		open: boolean;
		filter: AssetPickerFilter;
		config: AssetPickerConfig;
		mode?: 'github' | 'local';
		initialTab?: 'existing' | 'upload';
		allowMultipleUploads?: boolean;
		currentValue?: string | null;
		title?: string;
		oninsert: (
			value: string,
			result?: UploadResult,
			entry?: AssetPickerEntry
		) => void | Promise<void>;
		onupload?: (file: File) => Promise<UploadResult>;
		onclose: () => void;
		loadentries?: (options: {
			config: AssetPickerConfig;
			filter: AssetPickerFilter;
			mode: 'github' | 'local';
		}) => Promise<AssetPickerEntry[]>;
	}

	let {
		open,
		filter,
		config,
		mode = 'github',
		initialTab = 'upload',
		allowMultipleUploads = false,
		currentValue = null,
		title = 'Choose asset',
		oninsert,
		onupload,
		onclose,
		loadentries = loadAssetPickerEntriesForMode
	}: Props = $props();

	let entries = $state<AssetPickerEntry[]>([]);
	let selectedEntry = $state<AssetPickerEntry | null>(null);
	let search = $state('');
	let activeTab = $state<'existing' | 'upload'>('existing');
	let loading = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dialog = $state<HTMLDivElement | null>(null);
	let loadRequest = 0;
	let wasOpen = false;

	const hasConfig = $derived(hasAssetPickerConfig(config));
	const filteredEntries = $derived(
		entries.filter((entry) => {
			const query = search.trim().toLowerCase();
			return (
				!query ||
				entry.name.toLowerCase().includes(query) ||
				entry.relativePath.toLowerCase().includes(query)
			);
		})
	);
	const pickerDescription = $derived(
		filter.kind === 'image'
			? 'Pick an existing image or upload a new one.'
			: `Pick an existing ${filter.kind} asset or upload a new one.`
	);
	const acceptValue = $derived(
		filter.mimePrefix
			? `${filter.mimePrefix}*,${filter.extensions.join(',')}`
			: filter.extensions.join(',')
	);

	function logPicker(message: string, payload?: Record<string, unknown>) {
		console.info('[tentman:asset-picker] picker ' + message, payload ?? {});
	}

	function getTabClass(tab: 'existing' | 'upload'): string {
		return activeTab === tab
			? 'rounded-md border border-stone-300 bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-950'
			: 'rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-950';
	}

	async function loadEntries() {
		const requestId = ++loadRequest;
		loading = true;
		error = null;
		selectedEntry = null;
		logPicker('load start', {
			requestId,
			hasConfig,
			mode,
			currentValue,
			assetPath: config.assetPath ?? null,
			publicPath: config.publicPath ?? null,
			kind: filter.kind,
			extensions: filter.extensions
		});

		try {
			const nextEntries = hasConfig ? await loadentries({ config, filter, mode }) : [];
			if (requestId !== loadRequest) {
				logPicker('load ignored: stale request', { requestId, latestRequestId: loadRequest });
				return;
			}

			entries = nextEntries;
			selectedEntry =
				nextEntries.find((entry) => entry.publicPath === currentValue) ?? nextEntries[0] ?? null;
			logPicker('load complete', {
				requestId,
				count: nextEntries.length,
				selectedPublicPath: selectedEntry?.publicPath ?? null,
				sample: nextEntries.slice(0, 5).map((entry) => ({
					repoPath: entry.repoPath,
					publicPath: entry.publicPath
				}))
			});
		} catch (nextError) {
			if (requestId !== loadRequest) {
				logPicker('load error ignored: stale request', { requestId, latestRequestId: loadRequest });
				return;
			}

			entries = [];
			selectedEntry = null;
			error = nextError instanceof Error ? nextError.message : 'Failed to list assets';
			console.warn('[tentman:asset-picker] picker load failed', {
				requestId,
				error,
				assetPath: config.assetPath ?? null,
				publicPath: config.publicPath ?? null,
				mode
			});
		} finally {
			if (requestId === loadRequest) {
				loading = false;
				logPicker('load settled', { requestId, loading });
			}
		}
	}

	async function insertSelectedEntry() {
		if (!selectedEntry) {
			return;
		}

		logPicker('insert existing asset', {
			repoPath: selectedEntry.repoPath,
			publicPath: selectedEntry.publicPath
		});
		await oninsert(selectedEntry.publicPath, undefined, selectedEntry);
		onclose();
	}

	function getEntryKindLabel(entry: AssetPickerEntry): string {
		return entry.extension ? entry.extension.replace(/^\./, '').toUpperCase() : entry.kind;
	}

	function getNonImageEntryIcon(entry: AssetPickerEntry) {
		if (entry.kind === 'audio') {
			return FileAudio;
		}

		if (entry.kind === 'video') {
			return FileVideo;
		}

		if (entry.extension === '.pdf' || entry.extension === '.txt') {
			return FileText;
		}

		return FileIcon;
	}

	async function uploadFiles(files: File[]) {
		if (files.length === 0 || !onupload) {
			logPicker('upload skipped', {
				fileCount: files.length,
				hasUploadHandler: Boolean(onupload)
			});
			return;
		}

		uploading = true;
		error = null;
		logPicker('upload start', {
			count: files.length,
			files: files.map((file) => ({
				name: file.name,
				type: file.type,
				size: file.size
			})),
			assetPath: config.assetPath ?? null,
			publicPath: config.publicPath ?? null
		});

		try {
			for (const file of files) {
				const result = await onupload(file);
				logPicker('upload file complete', {
					name: file.name,
					value: result.value,
					hasPreviewUrl: Boolean(result.previewUrl)
				});
				await oninsert(result.value, result);
			}
			logPicker('upload complete', { count: files.length });
			onclose();
		} catch (nextError) {
			error = nextError instanceof Error ? nextError.message : 'Failed to upload asset';
			console.warn('[tentman:asset-picker] picker upload failed', { error });
		} finally {
			uploading = false;
			if (fileInput) {
				fileInput.value = '';
			}
		}
	}

	$effect(() => {
		if (!open) {
			wasOpen = false;
			return;
		}

		if (wasOpen) {
			return;
		}

		wasOpen = true;
		logPicker('opened', {
			initialTab,
			mode,
			hasConfig,
			assetPath: config.assetPath ?? null,
			publicPath: config.publicPath ?? null,
			currentValue
		});
		search = '';
		activeTab = initialTab;
		void tick().then(() => dialog?.focus());
	});

	$effect(() => {
		if (!open || activeTab !== 'existing') {
			return;
		}

		void loadEntries();
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) {
				onclose();
			}
		}}
	>
		<div
			bind:this={dialog}
			class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="asset-picker-title"
			tabindex="-1"
		>
			<div class="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
				<div>
					<h2 id="asset-picker-title" class="text-base font-semibold text-stone-950">
						{title}
					</h2>
					<p class="mt-1 text-sm text-stone-500">
						{pickerDescription}
					</p>
				</div>
				<button
					type="button"
					class="rounded-md px-2 py-1 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
					aria-label="Close"
					onclick={onclose}
				>
					Close
				</button>
			</div>

			<div class="flex items-center gap-2 border-b border-stone-200 px-5 py-3">
				<button type="button" class={getTabClass('upload')} onclick={() => (activeTab = 'upload')}>
					Upload new
				</button>
				<button
					type="button"
					class={getTabClass('existing')}
					onclick={() => (activeTab = 'existing')}
				>
					Existing assets
				</button>
			</div>

			{#if error}
				<div
					class="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
				>
					{error}
				</div>
			{/if}

			{#if activeTab === 'existing'}
				<div
					class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_20rem]"
				>
					<div
						class="min-h-0 overflow-y-auto border-b border-stone-200 p-5 md:border-r md:border-b-0"
					>
						{#if !hasConfig}
							<p class="text-sm text-stone-500">
								Configure assets.path and assets.publicPath in tentman.json to browse existing
								assets.
							</p>
						{:else}
							<label class="mb-4 block text-sm font-medium text-stone-700">
								<span class="mb-1 block">Search assets</span>
								<input
									type="search"
									class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
									bind:value={search}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											event.stopPropagation();
										}
									}}
								/>
							</label>

							{#if loading}
								<div class="flex items-center gap-2 py-8 text-sm text-stone-500">
									<LoadingSpinner size="sm" />
									<span>Loading assets...</span>
								</div>
							{:else if filteredEntries.length === 0}
								<p class="py-8 text-sm text-stone-500">No matching assets found.</p>
							{:else if filter.kind === 'image'}
								<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
									{#each filteredEntries as entry (entry.repoPath)}
										<button
											type="button"
											class="min-w-0 rounded-md border bg-white p-2 text-left shadow-sm transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
											class:border-stone-900={selectedEntry?.repoPath === entry.repoPath}
											class:border-stone-200={selectedEntry?.repoPath !== entry.repoPath}
											aria-pressed={selectedEntry?.repoPath === entry.repoPath}
											onclick={() => (selectedEntry = entry)}
										>
											<div
												class="aspect-square overflow-hidden rounded border border-stone-200 bg-stone-50"
											>
												<AssetImage
													value={entry.publicPath}
													alt={entry.name}
													class="h-full w-full object-cover"
												/>
											</div>
											<span class="mt-2 block truncate text-xs font-medium text-stone-800">
												{entry.name}
											</span>
										</button>
									{/each}
								</div>
							{:else}
								<div class="space-y-2">
									{#each filteredEntries as entry (entry.repoPath)}
										{@const EntryIcon = getNonImageEntryIcon(entry)}
										<button
											type="button"
											class="flex w-full min-w-0 items-center gap-3 rounded-md border bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
											class:border-stone-900={selectedEntry?.repoPath === entry.repoPath}
											class:border-stone-200={selectedEntry?.repoPath !== entry.repoPath}
											class:bg-stone-50={selectedEntry?.repoPath === entry.repoPath}
											aria-pressed={selectedEntry?.repoPath === entry.repoPath}
											onclick={() => (selectedEntry = entry)}
										>
											<span
												class="flex size-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-600"
											>
												<EntryIcon class="size-4" />
											</span>
											<span class="min-w-0 flex-1">
												<span class="block truncate text-sm font-medium text-stone-900">
													{entry.name}
												</span>
												<span class="mt-0.5 block truncate font-mono text-xs text-stone-500">
													{entry.relativePath}
												</span>
											</span>
											<span
												class="shrink-0 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 uppercase"
											>
												{getEntryKindLabel(entry)}
											</span>
										</button>
									{/each}
								</div>
							{/if}
						{/if}
					</div>

					<div class="min-h-0 overflow-y-auto p-5">
						{#if selectedEntry}
							{#if selectedEntry.kind === 'image'}
								<div class="overflow-hidden rounded-md border border-stone-200 bg-stone-50">
									<AssetImage
										value={selectedEntry.publicPath}
										alt={selectedEntry.name}
										class="max-h-64 w-full object-contain"
										loading="eager"
									/>
								</div>
							{:else if selectedEntry.kind === 'video'}
								<div class="overflow-hidden rounded-md border border-stone-200 bg-stone-950">
									<!-- svelte-ignore a11y_media_has_caption -->
									<video
										src={selectedEntry.publicPath}
										controls
										preload="metadata"
										class="aspect-video w-full object-contain"
									></video>
								</div>
							{:else if selectedEntry.kind === 'audio'}
								<div class="rounded-md border border-stone-200 bg-stone-50 p-3">
									<audio src={selectedEntry.publicPath} controls preload="metadata" class="w-full"
									></audio>
								</div>
							{:else}
								{@const DetailIcon = getNonImageEntryIcon(selectedEntry)}
								<div
									class="flex min-h-40 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-500"
								>
									<div class="text-center">
										<DetailIcon class="mx-auto size-10" />
										<p class="mt-2 text-xs font-semibold tracking-wide uppercase">
											{getEntryKindLabel(selectedEntry)}
										</p>
									</div>
								</div>
							{/if}
							<div class="mt-4 space-y-3 text-sm">
								<div>
									<p class="font-medium text-stone-950">{selectedEntry.name}</p>
									<p class="mt-1 break-all font-mono text-xs text-stone-600">
										{selectedEntry.publicPath}
									</p>
								</div>
								<div>
									<p class="text-xs font-medium tracking-wide text-stone-500 uppercase">
										Relative path
									</p>
									<p class="mt-1 break-all font-mono text-xs text-stone-600">
										{selectedEntry.relativePath}
									</p>
								</div>
								<div>
									<p class="text-xs font-medium tracking-wide text-stone-500 uppercase">
										Repository path
									</p>
									<p class="mt-1 break-all font-mono text-xs text-stone-600">
										{selectedEntry.repoPath}
									</p>
								</div>
							</div>
						{:else}
							<p class="text-sm text-stone-500">Select an asset to preview it.</p>
						{/if}
					</div>
				</div>

				<div class="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
					<button
						type="button"
						class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
						onclick={onclose}
					>
						Cancel
					</button>
					<button
						type="button"
						class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-300 disabled:text-stone-100 disabled:shadow-none"
						disabled={!selectedEntry}
						onclick={() => void insertSelectedEntry()}
					>
						Insert
					</button>
				</div>
			{:else}
				<div class="flex-1 p-5">
					{#if !onupload}
						<p class="text-sm text-stone-500">Uploads are not available here.</p>
					{:else}
						<label class="block max-w-lg text-sm font-medium text-stone-700">
							<span class="mb-1 block">Upload {filter.kind}</span>
							<input
								bind:this={fileInput}
								type="file"
								accept={acceptValue}
								multiple={allowMultipleUploads}
								disabled={uploading}
								class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-100"
								onchange={(event) => {
									const input = event.currentTarget as HTMLInputElement;
									const files = Array.from(input.files ?? []);
									void uploadFiles(allowMultipleUploads ? files : files.slice(0, 1));
								}}
							/>
						</label>
						<p class="mt-2 text-xs text-stone-500">
							New uploads are staged locally until you explicitly save.
						</p>
						{#if uploading}
							<div class="mt-4 flex items-center gap-2 text-sm text-stone-500">
								<LoadingSpinner size="sm" />
								<span>Staging upload...</span>
							</div>
						{/if}
					{/if}
				</div>

				<div class="flex justify-end border-t border-stone-200 px-5 py-4">
					<button
						type="button"
						class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
						onclick={onclose}
					>
						Cancel
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
