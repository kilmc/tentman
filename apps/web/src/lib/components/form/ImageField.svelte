<script lang="ts">
	import { page } from '$app/state';
	import AssetPicker from '$lib/components/assets/AssetPicker.svelte';
	import AssetImage from '$lib/components/AssetImage.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { imageAssetFilter, type AssetPickerEntry } from '$lib/features/assets/asset-picker';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { getDraftAssetRepoKey, isDraftAssetRef } from '$lib/features/draft-assets/shared';
	import { getDraftImageValidationError } from '$lib/features/draft-assets/validation';
	import { localContent } from '$lib/stores/local-content';

	interface Props {
		label: string;
		value: string;
		required?: boolean;
		onchange?: () => void;
		storagePath?: string;
		loadAssetEntries?: (options: {
			config: { assetPath?: string | null; publicPath?: string | null };
			filter: typeof imageAssetFilter;
			mode: 'github' | 'local';
		}) => Promise<AssetPickerEntry[]>;
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		onchange,
		storagePath = page.data.rootConfig?.assets?.path ?? '',
		loadAssetEntries = undefined
	}: Props = $props();

	let staging = $state(false);
	let uploadError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let pickerOpen = $state(false);
	let pickerInitialTab = $state<'existing' | 'upload'>('existing');
	const selectedBackendKind = $derived(page.data.selectedBackend?.kind);
	const activeRootConfig = $derived(
		selectedBackendKind === 'local'
			? ($localContent.rootConfig ?? page.data.rootConfig ?? null)
			: (page.data.rootConfig ?? null)
	);
	const publicPath = $derived(activeRootConfig?.assets?.publicPath);
	const uploadsDisabled = $derived(!storagePath || !publicPath);
	const pickerConfig = $derived({
		assetPath: activeRootConfig?.assets?.path,
		publicPath
	});
	const pickerMode = $derived(selectedBackendKind === 'local' ? 'local' : 'github');
	const uploadDisabledMessage =
		'Configure assets.path and assets.publicPath in tentman.json to enable uploads';

	const repoKey = $derived(
		getDraftAssetRepoKey({
			selectedBackend: page.data.selectedBackend,
			selectedRepo: page.data.selectedRepo
		})
	);

	async function cleanupDraftValue(targetValue: string) {
		if (!isDraftAssetRef(targetValue)) {
			return;
		}

		await draftAssetStore.delete(targetValue);
	}

	async function stageUpload(file: File): Promise<{ value: string; previewUrl?: string | null }> {
		uploadError = null;

		if (uploadsDisabled) {
			uploadError = uploadDisabledMessage;
			throw new Error(uploadDisabledMessage);
		}

		const validationError = getDraftImageValidationError(file);
		if (validationError) {
			uploadError = validationError;
			throw new Error(validationError);
		}

		if (!repoKey) {
			uploadError = 'Unable to determine the current repository for draft asset storage.';
			throw new Error(uploadError);
		}

		staging = true;

		try {
			const result = await draftAssetStore.create(file, {
				repoKey,
				storagePath,
				publicPath
			});
			return {
				value: result.ref,
				previewUrl: result.previewUrl
			};
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Failed to stage image';
			previewUrl = null;
			throw error;
		} finally {
			staging = false;
		}
	}

	async function handlePickerInsert(
		nextValue: string,
		result?: { value: string; previewUrl?: string | null }
	) {
		const previousValue = value;
		value = nextValue;
		previewUrl = result?.previewUrl ?? null;
		uploadError = null;
		onchange?.();
		await cleanupDraftValue(previousValue);
	}

	function openPicker(tab: 'existing' | 'upload') {
		console.info('[tentman:asset-picker] image field opening picker', {
			label,
			tab,
			mode: pickerMode,
			assetPath: pickerConfig.assetPath ?? null,
			publicPath: pickerConfig.publicPath ?? null,
			selectedBackendKind: page.data.selectedBackend?.kind ?? null,
			hasRootAssets: Boolean(activeRootConfig?.assets),
			hasCustomLoader: Boolean(loadAssetEntries)
		});
		uploadError = null;
		pickerInitialTab = tab;
		pickerOpen = true;
	}

	async function removeImage() {
		const previousValue = value;
		value = '';
		previewUrl = null;
		uploadError = null;
		onchange?.();
		await cleanupDraftValue(previousValue);
	}
</script>

<div class="mb-4">
	<div class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</div>

	{#if uploadError}
		<div class="mb-2 rounded border border-red-200 bg-red-50 p-2">
			<p class="text-sm text-red-600">{uploadError}</p>
		</div>
	{/if}

	{#if value || previewUrl}
		<div class="mb-2 flex items-start gap-3">
			<div class="relative flex-shrink-0">
				{#if previewUrl}
					<img
						src={previewUrl}
						alt={label}
						class="h-32 w-32 rounded border border-gray-300 object-cover"
					/>
				{:else}
					<AssetImage
						{value}
						alt={label}
						class="h-32 w-32 rounded border border-gray-300 object-cover"
						loading="eager"
					/>
				{/if}

				{#if staging}
					<div
						class="bg-opacity-50 absolute inset-0 flex items-center justify-center rounded bg-black"
					>
						<LoadingSpinner size="sm" variant="white" />
					</div>
				{/if}
			</div>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				{#if value}
					<p class="font-mono text-xs break-all text-gray-600">{value}</p>
				{/if}

				<button
					type="button"
					onclick={() => void removeImage()}
					class="self-start text-sm text-red-600 hover:underline"
				>
					Remove image
				</button>
			</div>
		</div>
	{/if}

	<div class="flex flex-wrap gap-2">
		<button
			type="button"
			class="rounded-md border border-stone-900 bg-stone-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-300 disabled:text-stone-100 disabled:shadow-none"
			disabled={staging}
			onclick={() => openPicker('existing')}
		>
			Choose asset
		</button>
		<button
			type="button"
			class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-300"
			disabled={staging || uploadsDisabled}
			title={uploadsDisabled ? uploadDisabledMessage : undefined}
			onclick={() => openPicker('upload')}
		>
			Upload new
		</button>
	</div>

	<p class="mt-1 text-xs text-gray-500">
		Select an image under 5 MB. The file will be staged locally until you explicitly save.
	</p>
</div>

<AssetPicker
	open={pickerOpen}
	filter={imageAssetFilter}
	config={pickerConfig}
	mode={pickerMode}
	currentValue={value}
	initialTab={pickerInitialTab}
	title="Choose image"
	oninsert={handlePickerInsert}
	onupload={stageUpload}
	onclose={() => (pickerOpen = false)}
	loadentries={loadAssetEntries}
/>
