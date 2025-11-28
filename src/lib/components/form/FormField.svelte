<script lang="ts">
	import type { FieldDefinition } from '$lib/types/config';
	import TextField from './TextField.svelte';
	import TextareaField from './TextareaField.svelte';
	import NumberField from './NumberField.svelte';
	import DateField from './DateField.svelte';
	import BooleanField from './BooleanField.svelte';
	import EmailField from './EmailField.svelte';
	import UrlField from './UrlField.svelte';
	import MarkdownField from './MarkdownField.svelte';
	import ImageField from './ImageField.svelte';
	import ArrayField from './ArrayField.svelte';

	interface Props {
		fieldName: string;
		fieldDef: FieldDefinition;
		value: any;
		onchange?: (value: any) => void;
		imagePath?: string; // Custom image storage path from config
	}

	let { fieldName, fieldDef, value = $bindable(), onchange, imagePath }: Props = $props();

	// Parse field definition
	const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;
	const required = typeof fieldDef === 'object' ? fieldDef.required ?? false : false;
	const nestedFields = typeof fieldDef === 'object' ? fieldDef.fields : undefined;

	// Generate label from field name
	const label = fieldName
		.replace(/([A-Z])/g, ' $1')
		.replace(/_/g, ' ')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();

	function handleChange(newValue: any) {
		value = newValue;
		onchange?.(newValue);
	}
</script>

{#if fieldType === 'text'}
	<TextField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'textarea'}
	<TextareaField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'markdown'}
	<MarkdownField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'email'}
	<EmailField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'url'}
	<UrlField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'number'}
	<NumberField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'date'}
	<DateField {label} bind:value {required} oninput={handleChange} />
{:else if fieldType === 'boolean'}
	<BooleanField {label} bind:value {required} onchange={handleChange} />
{:else if fieldType === 'image'}
	<ImageField {label} bind:value {required} onchange={handleChange} storagePath={imagePath} />
{:else if fieldType === 'array'}
	<ArrayField {label} bind:value fields={nestedFields} {required} onchange={handleChange} />
{:else}
	<div class="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
		Unsupported field type: {fieldType}
	</div>
{/if}
