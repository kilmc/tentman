<script lang="ts">
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

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
	let uploadProgress = $state(0); // 0-100
	let fileSize = $state<number | null>(null);
	let uploadSpeed = $state<number | null>(null); // bytes per second
	let uploadedBytes = $state(0);
	let startTime = $state<number | null>(null);

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
	}

	function formatSpeed(bytesPerSecond: number): string {
		return formatBytes(bytesPerSecond) + '/s';
	}

	async function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		// Reset state
		uploadError = null;
		uploadProgress = 0;
		uploadedBytes = 0;
		uploadSpeed = null;
		startTime = null;

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

		// Store file size
		fileSize = file.size;

		// Create preview URL
		previewUrl = URL.createObjectURL(file);

		// Upload the file using XMLHttpRequest for progress tracking
		uploading = true;
		startTime = Date.now();

		return new Promise<void>((resolve, reject) => {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('storagePath', storagePath);

			const xhr = new XMLHttpRequest();

			// Track upload progress
			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					uploadProgress = Math.round((e.loaded / e.total) * 100);
					uploadedBytes = e.loaded;

					// Calculate upload speed
					if (startTime) {
						const elapsedSeconds = (Date.now() - startTime) / 1000;
						uploadSpeed = elapsedSeconds > 0 ? e.loaded / elapsedSeconds : 0;
					}
				}
			});

			// Handle completion
			xhr.addEventListener('load', () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const result = JSON.parse(xhr.responseText);
						value = result.path;
						onchange?.();
						resolve();
					} catch (err) {
						uploadError = 'Failed to parse server response';
						previewUrl = null;
						reject(err);
					}
				} else {
					try {
						const errorData = JSON.parse(xhr.responseText);
						uploadError = errorData.message || 'Upload failed';
					} catch {
						uploadError = 'Upload failed';
					}
					previewUrl = null;
					reject(new Error(uploadError || 'Upload failed'));
				}
				uploading = false;
			});

			// Handle errors
			xhr.addEventListener('error', () => {
				uploadError = 'Network error during upload';
				previewUrl = null;
				uploading = false;
				reject(new Error('Network error'));
			});

			// Handle abort
			xhr.addEventListener('abort', () => {
				uploadError = 'Upload cancelled';
				previewUrl = null;
				uploading = false;
				reject(new Error('Upload cancelled'));
			});

			xhr.open('POST', '/api/upload-image');
			xhr.send(formData);
		});
	}

	function removeImage() {
		value = '';
		previewUrl = null;
		uploadError = null;
		uploadProgress = 0;
		fileSize = null;
		uploadSpeed = null;
		uploadedBytes = 0;
		startTime = null;
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
		<div class="mb-2 flex items-start gap-3">
			<div class="relative flex-shrink-0">
				<img
					src={previewUrl || value}
					alt={label}
					class="h-32 w-32 rounded border border-gray-300 object-cover"
				/>
				{#if uploading}
					<div
						class="absolute inset-0 flex items-center justify-center rounded bg-black bg-opacity-50"
					>
						<LoadingSpinner size="sm" variant="white" />
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-2 flex-1 min-w-0">
				{#if value}
					<p class="text-xs text-gray-600 font-mono break-all">{value}</p>
				{/if}

				{#if uploading}
					<!-- Upload progress section -->
					<div class="space-y-1">
						<div class="flex items-center justify-between text-xs text-gray-600">
							<span>Uploading...</span>
							<span class="font-medium">{uploadProgress}%</span>
						</div>

						<!-- Progress bar -->
						<div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
							<div
								class="bg-blue-600 h-2 rounded-full transition-all duration-300"
								style="width: {uploadProgress}%"
							></div>
						</div>

						<!-- File size and speed -->
						<div class="flex items-center justify-between text-xs text-gray-500">
							<span>
								{#if fileSize}
									{formatBytes(uploadedBytes)} / {formatBytes(fileSize)}
								{/if}
							</span>
							<span>
								{#if uploadSpeed !== null && uploadSpeed > 0}
									{formatSpeed(uploadSpeed)}
								{/if}
							</span>
						</div>
					</div>
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
