<script lang="ts">
	import { page } from '$app/state';
	import AssetImage from '$lib/components/AssetImage.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { draftAssetStore } from '$lib/features/draft-assets/store';
	import { getDraftAssetRepoKey, isDraftAssetRef } from '$lib/features/draft-assets/shared';
	import { getDraftImageValidationError } from '$lib/features/draft-assets/validation';

	interface Props {
		label: string;
		value: string;
		required?: boolean;
		onchange?: () => void;
		storagePath?: string;
		assetsDir?: string;
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		onchange,
		storagePath = 'static/images/',
		assetsDir
	}: Props = $props();

	const inputId = `image-field-${Math.random().toString(36).substring(2, 9)}`;

	let staging = $state(false);
	let uploadError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);

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

	async function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		uploadError = null;

		const validationError = getDraftImageValidationError(file);
		if (validationError) {
			uploadError = validationError;
			return;
		}

		if (!repoKey) {
			uploadError = 'Unable to determine the current repository for draft asset storage.';
			return;
		}

		staging = true;

		try {
			const previousValue = value;
			const result = await draftAssetStore.create(file, {
				repoKey,
				storagePath
			});
			value = result.ref;
			previewUrl = result.previewUrl;
			onchange?.();
			await cleanupDraftValue(previousValue);
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Failed to stage image';
			previewUrl = null;
		} finally {
			staging = false;
			target.value = '';
		}
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
	<label for={inputId} class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>

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
						{assetsDir}
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

	<input
		id={inputId}
		type="file"
		accept="image/*"
		required={required && !value}
		onchange={handleChange}
		disabled={staging}
		class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
	/>

	<p class="mt-1 text-xs text-gray-500">
		Select an image under 5 MB. The file will be staged locally until you explicitly save.
	</p>
</div>
