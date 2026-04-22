<script lang="ts">
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
	import type { BlockUsage } from '$lib/config/types';
	import TextField from './TextField.svelte';
	import TextareaField from './TextareaField.svelte';
	import NumberField from './NumberField.svelte';
	import DateField from './DateField.svelte';
	import BooleanField from './BooleanField.svelte';
	import EmailField from './EmailField.svelte';
	import UrlField from './UrlField.svelte';
	import SelectField from './SelectField.svelte';
	import MarkdownField from './MarkdownField.svelte';
	import ImageField from './ImageField.svelte';
	import ArrayField from './ArrayField.svelte';
	import StructuredBlockField from './StructuredBlockField.svelte';

	interface Props {
		block: BlockUsage;
		value: any;
		fieldPath?: string;
		onchange?: () => void;
		imagePath?: string; // Custom image storage path from config
		blockRegistry: BlockRegistry;
	}

	let { block, value = $bindable(), fieldPath, onchange, imagePath, blockRegistry }: Props =
		$props();

	function getBlockLabel(id: string): string {
		return id
			.replace(/([A-Z])/g, ' $1')
			.replace(/_/g, ' ')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}

	const label = block.label ?? getBlockLabel(block.id);
	const required = block.required ?? false;
	const minLength = block.minLength;
	const maxLength = block.maxLength;
	const structuredBlocks = getStructuredBlocksForUsage(block, blockRegistry);
	const fieldType = structuredBlocks
		? structuredBlocks.collection
			? 'array'
			: 'object'
		: block.type;
</script>

{#if fieldType === 'text'}
	<TextField {label} bind:value {required} {minLength} {maxLength} {onchange} />
{:else if fieldType === 'textarea'}
	<TextareaField {label} bind:value {required} {minLength} {maxLength} {onchange} />
{:else if fieldType === 'markdown'}
	<MarkdownField
		fieldId={block.id}
		{label}
		bind:value
		{required}
		{minLength}
		{maxLength}
		plugins={block.plugins}
		{onchange}
		storagePath={block.assetsDir ?? imagePath}
		assetsDir={block.assetsDir}
	/>
{:else if fieldType === 'email'}
	<EmailField {label} bind:value {required} {onchange} />
{:else if fieldType === 'url'}
	<UrlField {label} bind:value {required} {onchange} />
{:else if fieldType === 'select'}
	<SelectField {label} bind:value options={block.options} {required} {onchange} />
{:else if fieldType === 'number'}
	<NumberField {label} bind:value {required} {onchange} />
{:else if fieldType === 'date'}
	<DateField {label} bind:value {required} {onchange} />
{:else if fieldType === 'boolean'}
	<BooleanField {label} bind:value {required} {onchange} />
{:else if fieldType === 'image'}
	<ImageField
		{label}
		bind:value
		{required}
		{onchange}
		storagePath={block.assetsDir ?? imagePath}
		assetsDir={block.assetsDir ?? imagePath}
	/>
{:else if fieldType === 'array'}
	<ArrayField
		{label}
		bind:value
		{fieldPath}
		blocks={structuredBlocks?.blocks ?? []}
		itemLabel={block.itemLabel}
		{required}
		{onchange}
		{imagePath}
		{blockRegistry}
	/>
{:else if fieldType === 'object'}
	<StructuredBlockField
		{label}
		bind:value
		{fieldPath}
		blocks={structuredBlocks?.blocks ?? []}
		{required}
		{onchange}
		{imagePath}
		{blockRegistry}
	/>
{:else}
	<div class="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
		Unsupported block type: {block.type}
	</div>
{/if}
