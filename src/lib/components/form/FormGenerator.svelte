<script lang="ts">
	import type { Config } from '$lib/types/config';
	import { normalizeFields } from '$lib/types/config';
	import { validateFormData, type ValidationError } from '$lib/utils/validation';
	import FormField from './FormField.svelte';

	interface Props {
		config: Config;
		initialData?: Record<string, any>;
		existingItems?: any[];
		currentItemId?: string;
		// Function to get current form data - called by parent before submit
		onvalidate?: (data: Record<string, any>, errors: ValidationError[]) => void;
	}

	let {
		config,
		initialData = {},
		existingItems = [],
		currentItemId,
		onvalidate
	}: Props = $props();

	// Normalize fields to object format (supports both array and object configs)
	const normalizedFields = normalizeFields(config.fields);

	// Helper function to initialize form data
	function initializeFormData(initial: Record<string, any>): Record<string, any> {
		const newFormData: Record<string, any> = {};
		for (const [fieldName, fieldDef] of Object.entries(normalizedFields)) {
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

	// FormGenerator owns its own state - initialize once with structuredClone
	let formData = $state<Record<string, any>>(initializeFormData(structuredClone(initialData)));
	let validationErrors = $state<ValidationError[]>([]);
	let showErrors = $state(false);

	// Validate and return errors - can be called by parent
	export function validate(): { data: Record<string, any>; errors: ValidationError[] } {
		const errors = validateFormData(config, formData, {
			existingItems,
			currentItemId
		});
		validationErrors = errors;
		showErrors = true;

		// Call onvalidate callback if provided
		onvalidate?.(formData, errors);

		return { data: formData, errors };
	}

	// Get current form data without validation
	export function getData(): Record<string, any> {
		return formData;
	}

	function handleFieldChange(fieldName: string) {
		// Clear errors for this field when user makes changes
		if (showErrors) {
			validationErrors = validationErrors.filter((err) => err.field !== fieldName);
		}
	}

	function getFieldError(fieldName: string): string | undefined {
		return validationErrors.find((err) => err.field === fieldName)?.message;
	}
</script>

<div class="space-y-4">
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

	{#each Object.entries(normalizedFields) as [fieldName, fieldDef]}
		<div>
			<FormField
				{fieldName}
				{fieldDef}
				bind:value={formData[fieldName]}
				imagePath={config.imagePath}
				onchange={() => handleFieldChange(fieldName)}
			/>
			{#if showErrors && getFieldError(fieldName)}
				<p class="mt-1 text-sm text-red-600">{getFieldError(fieldName)}</p>
			{/if}
		</div>
	{/each}
</div>
