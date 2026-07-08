<script lang="ts">
	import { setContext } from 'svelte';
	import MarkdownField from '$lib/components/form/MarkdownField.svelte';
	import {
		FORM_CONTENT_CONTEXT,
		type FormContentContext
	} from '$lib/components/form/form-content-context';
	import type { ContentComponentRegistry } from '$lib/content-components/registry';

	interface Props {
		baseline?: string;
		value?: string;
	}

	let { baseline = 'Original body\n', value = $bindable('Original body\n') }: Props = $props();
	let dirtyLabel = $state('clean');

	const emptyContentComponentRegistry: ContentComponentRegistry = {
		components: [],
		errors: [],
		getByName() {
			return undefined;
		}
	};

	setContext<FormContentContext>(FORM_CONTENT_CONTEXT, {
		getRootBlocks() {
			return [];
		},
		getRootData() {
			return { body: value };
		},
		getBlockRegistry() {
			return {
				entries: [],
				get: () => undefined,
				has: () => false,
				getAdapter: () => undefined
			};
		},
		getBaselineFieldValue(path) {
			return path === 'body' ? baseline : undefined;
		},
		updateSemanticFieldFingerprint(fingerprint) {
			dirtyLabel =
				fingerprint.baselineFingerprint === fingerprint.currentFingerprint ? 'clean' : 'dirty';
		}
	});

	function handleChange() {
		// The bound value already carries the latest markdown.
	}
</script>

<MarkdownField
	fieldId="body"
	fieldPath="body"
	label="Body"
	bind:value
	onchange={handleChange}
	testAdapters={{
		componentMode: 'local',
		loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry
	}}
/>

<p data-testid="semantic-dirty-state">{dirtyLabel}</p>
