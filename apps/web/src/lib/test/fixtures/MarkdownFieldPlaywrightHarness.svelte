<script lang="ts">
	import { setContext } from 'svelte';
	import MarkdownField from '$lib/components/form/MarkdownField.svelte';
	import {
		FORM_CONTENT_CONTEXT,
		type FormContentContext
	} from '$lib/components/form/form-content-context';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { BlockUsage } from '$lib/config/types';
	import type { ContentRecord } from '$lib/features/content-management/types';

	interface Props {
		testId: string;
		label: string;
		value: string;
		validationErrors?: string[];
		required?: boolean;
		placeholder?: string;
		rows?: number;
		minLength?: number;
		maxLength?: number;
		components?: string[] | undefined;
		storagePath?: string;
		assetsDir?: string;
		rootBlocks?: BlockUsage[];
		rootData?: ContentRecord;
		blockRegistry?: BlockRegistry;
		testAdapters?: unknown;
	}

	const emptyBlockRegistry: BlockRegistry = {
		entries: [],
		get() {
			return undefined;
		},
		has() {
			return false;
		},
		getAdapter() {
			return undefined;
		}
	};

	let {
		testId,
		label,
		value = $bindable(''),
		validationErrors = $bindable([]),
		required = false,
		placeholder = 'Write in Markdown',
		rows = 12,
		minLength = undefined,
		maxLength = undefined,
		components = undefined,
		storagePath = 'static/images/',
		assetsDir = undefined,
		rootBlocks = [],
		rootData = {},
		blockRegistry = emptyBlockRegistry,
		testAdapters = undefined
	}: Props = $props();

	setContext<FormContentContext>(FORM_CONTENT_CONTEXT, {
		getRootBlocks() {
			return rootBlocks;
		},
		getRootData() {
			return rootData;
		},
		getBlockRegistry() {
			return blockRegistry;
		}
	});
</script>

<div data-testid={testId} class="space-y-4 rounded-xl border border-stone-300 bg-stone-50 p-4">
	<MarkdownField
		{label}
		bind:value
		{required}
		{placeholder}
		{rows}
		{minLength}
		{maxLength}
		{components}
		{storagePath}
		{assetsDir}
		{testAdapters}
		onvalidationchange={(errors) => (validationErrors = errors)}
	/>

	<div class="grid gap-3 lg:grid-cols-2">
		<pre
			data-testid={`${testId}-markdown-value`}
			class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{value}</pre>
		<pre
			data-testid={`${testId}-validation-errors`}
			class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify(
				validationErrors
			)}</pre>
	</div>

	<p data-testid={`${testId}-save-state`} class="text-sm text-stone-700">
		{validationErrors.length === 0 ? 'save-allowed' : 'save-blocked'}
	</p>
</div>
