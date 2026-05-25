<script lang="ts">
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
	import type { BlockUsage, TentmanGroupBlockUsage } from '$lib/config/types';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import {
		getSelectOptionsFromNavigationGroups,
		getTentmanGroupOptions,
		resolveSelectOptions
	} from '$lib/features/content-management/navigation-group-options';
	import { isTentmanGroupBlock } from '$lib/config/tentman-group';
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
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import { containsNestedStructuredCollection } from '$lib/features/forms/object-panel';

	interface Props {
		block: BlockUsage;
		value: any;
		fieldPath?: string;
		onchange?: () => void;
		onvaluechange?: (value: any) => void;
		onvalidationchange?: (errors: string[]) => void;
		imagePath?: string; // Custom image storage path from config
		blockRegistry: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		onaddselectoption?: (input: {
			collection: string;
			id: string;
			value: string;
			label: string;
		}) => Promise<void>;
	}

	let {
		block,
		value = $bindable(),
		fieldPath,
		onchange,
		onvaluechange,
		onvalidationchange,
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

	const label = $derived(block.label ?? getBlockLabel(block.id));
	const required = $derived(block.required ?? false);
	const minLength = $derived(block.minLength);
	const maxLength = $derived(block.maxLength);
	const structuredBlocks = $derived(getStructuredBlocksForUsage(block, blockRegistry));
	const fieldType = $derived(
		structuredBlocks ? (structuredBlocks.collection ? 'array' : 'object') : block.type
	);
	const shouldUseObjectPanel = $derived(
		fieldType === 'object' &&
			!!structuredBlocks &&
			containsNestedStructuredCollection(structuredBlocks.blocks, blockRegistry)
	);
	const selectOptions = $derived(resolveSelectOptions(block.options, navigationManifest));
	const tentmanGroupOptions = $derived(
		isTentmanGroupBlock(block) ? getTentmanGroupOptions(block as TentmanGroupBlockUsage) : undefined
	);
	const tentmanGroupSelectOptions = $derived(
		isTentmanGroupBlock(block)
			? getSelectOptionsFromNavigationGroups(
					navigationManifest,
					(block as TentmanGroupBlockUsage).collection
				)
			: []
	);

	function getFallbackValue() {
		switch (fieldType) {
			case 'text':
			case 'textarea':
			case 'markdown':
			case 'email':
			case 'url':
			case 'select':
			case 'tentmanGroup':
			case 'date':
			case 'image':
				return '';
			case 'number':
				return 0;
			case 'boolean':
			case 'toggle':
				return false;
			case 'array':
				return [];
			case 'object':
				return buildBlockFormData(structuredBlocks?.blocks ?? [], {}, blockRegistry);
			default:
				return value;
		}
	}

	function normalizeFieldValue(nextValue: unknown) {
		return nextValue === undefined ? getFallbackValue() : nextValue;
	}

	let fieldValue = $state(normalizeFieldValue(value));

	$effect(() => {
		fieldValue = normalizeFieldValue(value);
	});

	function handleChange() {
		value = fieldValue;
		onchange?.();
		onvaluechange?.(fieldValue);
	}
</script>

<div data-block-id={block.id} data-field-path={fieldPath}>
	{#if fieldType === 'text'}
		<TextField
			{label}
			bind:value={fieldValue}
			{required}
			{minLength}
			{maxLength}
			onchange={handleChange}
		/>
	{:else if fieldType === 'textarea'}
		<TextareaField
			{label}
			bind:value={fieldValue}
			{required}
			{minLength}
			{maxLength}
			onchange={handleChange}
		/>
	{:else if fieldType === 'markdown'}
		<MarkdownField
			fieldId={block.id}
			{label}
			bind:value={fieldValue}
			{required}
			{minLength}
			{maxLength}
			components={block.components}
			onchange={handleChange}
			{onvalidationchange}
			storagePath={block.assetsDir ?? imagePath}
			assetsDir={block.assetsDir}
		/>
	{:else if fieldType === 'email'}
		<EmailField {label} bind:value={fieldValue} {required} onchange={handleChange} />
	{:else if fieldType === 'url'}
		<UrlField {label} bind:value={fieldValue} {required} onchange={handleChange} />
	{:else if fieldType === 'select'}
		<SelectField
			{label}
			bind:value={fieldValue}
			options={selectOptions}
			{required}
			onchange={handleChange}
		/>
	{:else if fieldType === 'tentmanGroup'}
		<SelectField
			{label}
			bind:value={fieldValue}
			options={tentmanGroupSelectOptions}
			sourceOptions={tentmanGroupOptions}
			{required}
			onchange={handleChange}
			onaddoption={onaddselectoption}
		/>
	{:else if fieldType === 'number'}
		<NumberField {label} bind:value={fieldValue} {required} onchange={handleChange} />
	{:else if fieldType === 'date'}
		<DateField {label} bind:value={fieldValue} {required} onchange={handleChange} />
	{:else if fieldType === 'boolean' || fieldType === 'toggle'}
		<BooleanField {label} bind:value={fieldValue} {required} onchange={handleChange} />
	{:else if fieldType === 'image'}
		<ImageField
			{label}
			bind:value={fieldValue}
			{required}
			onchange={handleChange}
			storagePath={block.assetsDir ?? imagePath}
			assetsDir={block.assetsDir ?? imagePath}
		/>
	{:else if fieldType === 'array'}
		<ArrayField
			{label}
			bind:value={fieldValue}
			{fieldPath}
			blocks={structuredBlocks?.blocks ?? []}
			editorLayout={structuredBlocks?.editorLayout}
			itemLabel={block.itemLabel}
			{required}
			onchange={handleChange}
			{imagePath}
			{blockRegistry}
			{navigationManifest}
			{onaddselectoption}
		/>
	{:else if fieldType === 'object'}
		{#if shouldUseObjectPanel}
			<StructuredObjectPanelField
				{label}
				bind:value={fieldValue}
				{fieldPath}
				blocks={structuredBlocks?.blocks ?? []}
				editorLayout={structuredBlocks?.editorLayout}
				{required}
				{imagePath}
				{blockRegistry}
				{navigationManifest}
				{onaddselectoption}
			/>
		{:else}
			<StructuredBlockField
				{label}
				bind:value={fieldValue}
				{fieldPath}
				blocks={structuredBlocks?.blocks ?? []}
				editorLayout={structuredBlocks?.editorLayout}
				{required}
				onchange={handleChange}
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
</div>
