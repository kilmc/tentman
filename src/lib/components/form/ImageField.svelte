<script lang="ts">
	interface Props {
		label: string;
		value: string;
		required?: boolean;
		onchange?: () => void;
		storagePath?: string; // Optional custom storage path (defaults to 'static/images/')
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		onchange,
		storagePath = 'static/images/'
	}: Props = $props();

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);

	async function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		// Reset error state
		uploadError = null;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			uploadError = 'Please select an image file';
			return;
		}

		// Validate file size (max 5MB)
		const maxSize = 5 * 1024 * 1024;
		if (file.size > maxSize) {
			uploadError = 'Image must be less than 5MB';
			return;
		}

		// Create preview URL
		previewUrl = URL.createObjectURL(file);

		// Upload the file
		uploading = true;

		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('storagePath', storagePath);

			const response = await fetch('/api/upload-image', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.message || 'Upload failed');
			}

			const result = await response.json();

			// Update the value with the uploaded image path
			value = result.path;
			onchange?.();
		} catch (err) {
			console.error('Upload error:', err);
			uploadError = err instanceof Error ? err.message : 'Failed to upload image';
			previewUrl = null;
		} finally {
			uploading = false;
		}
	}

	function removeImage() {
		value = '';
		previewUrl = null;
		uploadError = null;
		onchange?.();
	}
</script>

<div class="mb-4">
	<label class="mb-1 block text-sm font-medium text-gray-700">
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
		<div class="mb-2 flex items-center gap-3">
			<div class="relative">
				<img
					src={previewUrl || value}
					alt={label}
					class="h-32 w-32 rounded border border-gray-300 object-cover"
				/>
				{#if uploading}
					<div
						class="absolute inset-0 flex items-center justify-center rounded bg-black bg-opacity-50"
					>
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent"
						></div>
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-1">
				{#if value}
					<p class="text-xs text-gray-600 font-mono break-all max-w-xs">{value}</p>
				{/if}
				{#if uploading}
					<p class="text-sm text-gray-600">Uploading...</p>
				{:else}
					<button
						type="button"
						onclick={removeImage}
						class="text-sm text-red-600 hover:underline self-start"
					>
						Remove image
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<input
		type="file"
		accept="image/*"
		required={required && !value}
		onchange={handleChange}
		disabled={uploading}
		class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
	/>

	<p class="mt-1 text-xs text-gray-500">
		{#if uploading}
			Uploading to repository...
		{:else}
			Images are uploaded to {storagePath} in your repository
		{/if}
	</p>
</div>
