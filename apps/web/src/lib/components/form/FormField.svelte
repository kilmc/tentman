<script lang="ts">
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
	import type { BlockUsage } from '$lib/config/types';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import {
		isNavigationGroupsSelectOptions,
		resolveSelectOptions
	} from '$lib/features/content-management/navigation-group-options';
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
	import StructuredObjectPanelField from './StructuredObjectPanelField.svelte';
	import { containsNestedStructuredCollection } from '$lib/features/forms/object-panel';

	interface Props {
		block: BlockUsage;
		value: any;
		fieldPath?: string;
		onchange?: () => void;
		imagePath?: string; // Custom image storage path from config
		blockRegistry: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		onaddselectoption?: (input: { collection: string; id: string; label: string }) => Promise<void>;
	}

	let {
		block,
		value = $bindable(),
		fieldPath,
		onchange,
		imagePath,
		blockRegistry,
		navigationManifest,
		onaddselectoption
	}: Props = $props();

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
	const shouldUseObjectPanel = $derived(
		fieldType === 'object' &&
			!!structuredBlocks &&
			containsNestedStructuredCollection(structuredBlocks.blocks, blockRegistry)
	);
	const selectOptions = $derived(resolveSelectOptions(block.options, navigationManifest));
	const sourceOptions = $derived(
		isNavigationGroupsSelectOptions(block.options) ? block.options : undefined
	);
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
	<SelectField
		{label}
		bind:value
		options={selectOptions}
		{sourceOptions}
		{required}
		{onchange}
		onaddoption={onaddselectoption}
	/>
{:else if fieldType === 'number'}
	<NumberField {label} bind:value {required} {onchange} />
{:else if fieldType === 'date'}
	<DateField {label} bind:value {required} {onchange} />
{:else if fieldType === 'boolean' || fieldType === 'toggle'}
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
		{navigationManifest}
		{onaddselectoption}
	/>
{:else if fieldType === 'object'}
	{#if shouldUseObjectPanel}
		<StructuredObjectPanelField
			{label}
			bind:value
			{fieldPath}
			blocks={structuredBlocks?.blocks ?? []}
			{required}
			{imagePath}
			{blockRegistry}
			{navigationManifest}
			{onaddselectoption}
		/>
	{:else}
		<StructuredBlockField
			{label}
			bind:value
			{fieldPath}
			blocks={structuredBlocks?.blocks ?? []}
			{required}
			{onchange}
			{imagePath}
			{blockRegistry}
			{navigationManifest}
			{onaddselectoption}
		/>
	{/if}
{:else}
	<div class="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
		Unsupported block type: {block.type}
	</div>
{/if}
