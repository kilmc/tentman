<script lang="ts">
	import type { Config } from '$lib/types/config';
	import { validateFormData, type ValidationError } from '$lib/utils/validation';
	import FormField from './FormField.svelte';

	interface Props {
		config: Config;
		initialData?: Record<string, any>;
		onchange?: (data: Record<string, any>) => void;
		onsubmit?: (data: Record<string, any>) => void;
		oncancel?: () => void;
		submitLabel?: string;
		cancelLabel?: string;
		showButtons?: boolean;
		existingItems?: any[];
		currentItemId?: string;
	}

	let {
		config,
		initialData = {},
		onchange,
		onsubmit,
		oncancel,
		submitLabel = 'Save',
		cancelLabel = 'Cancel',
		showButtons = true,
		existingItems = [],
		currentItemId
	}: Props = $props();

	// Helper function to initialize form data
	function initializeFormData(initial: Record<string, any>): Record<string, any> {
		const newFormData: Record<string, any> = {};
		for (const [fieldName, fieldDef] of Object.entries(config.fields)) {
			const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;

			// Use initial data if available, otherwise use type-based defaults
			if (initial[fieldName] !== undefined) {
				newFormData[fieldName] = initial[fieldName];
			} else {
				switch (fieldType) {
					case 'boolean':
						newFormData[fieldName] = false;
						break;
					case 'number':
						newFormData[fieldName] = 0;
						break;
					case 'array':
						newFormData[fieldName] = [];
						break;
					default:
						newFormData[fieldName] = '';
				}
			}
		}
		return newFormData;
	}

	// FormGenerator owns its own state - initialize immediately to avoid undefined bindings
	let formData = $state<Record<string, any>>(initializeFormData(initialData));
	let validationErrors = $state<ValidationError[]>([]);
	let showErrors = $state(false);

	// Re-initialize form data when initialData changes
	$effect(() => {
		formData = initializeFormData(initialData);
		showErrors = false;
		validationErrors = [];

		// Notify parent of initial data
		onchange?.(formData);
	});

	function handleSubmit(event: Event) {
		event.preventDefault();

		// Validate form data with uniqueness check
		const errors = validateFormData(config, formData, {
			existingItems,
			currentItemId
		});
		validationErrors = errors;
		showErrors = true;

		// Only submit if no errors
		if (errors.length === 0) {
			onsubmit?.(formData);
		}
	}

	function handleFieldChange(fieldName: string, value: any) {
		formData = { ...formData, [fieldName]: value };

		// Notify parent of changes
		onchange?.(formData);

		// Clear errors for this field when user makes changes
		if (showErrors) {
			validationErrors = validationErrors.filter((err) => err.field !== fieldName);
		}
	}

	function getFieldError(fieldName: string): string | undefined {
		return validationErrors.find((err) => err.field === fieldName)?.message;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	{#if showErrors && validationErrors.length > 0}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<h3 class="mb-2 font-semibold text-red-800">Please fix the following errors:</h3>
			<ul class="list-inside list-disc space-y-1 text-sm text-red-700">
				{#each validationErrors as error}
					<li>{error.message}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#each Object.entries(config.fields) as [fieldName, fieldDef]}
		<div>
			<FormField
				{fieldName}
				{fieldDef}
				bind:value={formData[fieldName]}
				onchange={(value) => handleFieldChange(fieldName, value)}
				imagePath={config.imagePath}
			/>
			{#if showErrors && getFieldError(fieldName)}
				<p class="mt-1 text-sm text-red-600">{getFieldError(fieldName)}</p>
			{/if}
		</div>
	{/each}

	{#if showButtons}
		<div class="flex gap-2 border-t border-gray-200 pt-4">
			<button
				type="submit"
				class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				{submitLabel}
			</button>
			{#if oncancel}
				<button
					type="button"
					onclick={oncancel}
					class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>
					{cancelLabel}
				</button>
			{/if}
		</div>
	{/if}
</form>
