<script lang="ts">
	import { getMockFormGeneratorResult } from '$lib/test/mock-form-generator';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { FormEditSessionRecoveryState } from '$lib/features/forms/edit-session';
	import type { ValidationError } from '$lib/utils/validation';

	interface Props {
		onvalidate?: (data: ContentRecord, errors: ValidationError[]) => void;
		ondirtystatechange?: (state: { isDirty: boolean }) => void;
		onchange?: (data: ContentRecord) => void;
	}

	let { onvalidate, ondirtystatechange, onchange }: Props = $props();
	let currentData = $state(getMockFormGeneratorResult().data);
	let currentErrors = $state(getMockFormGeneratorResult().errors);

	export function validate() {
		onvalidate?.(currentData, currentErrors);
		return {
			data: currentData,
			errors: currentErrors
		};
	}

	export function prepareSubmit() {
		onvalidate?.(currentData, currentErrors);
		return {
			ok: currentErrors.length === 0,
			data: currentData,
			errors: currentErrors,
			message: currentErrors[0]?.message
		};
	}

	export function getData() {
		return currentData;
	}

	export function exportRecoveryState(): FormEditSessionRecoveryState {
		return {
			data: currentData,
			baseline: {},
			panelStack: []
		};
	}

	export function restoreRecoveryState(state: FormEditSessionRecoveryState) {
		currentData = state.data;
		currentErrors = [];
		ondirtystatechange?.({ isDirty: true });
		onchange?.(currentData);
	}
</script>

<div data-testid="mock-form-generator"></div>
<div data-testid="mock-form-data">{JSON.stringify(currentData)}</div>
<button
	type="button"
	data-testid="mock-form-dirty"
	onclick={() => {
		ondirtystatechange?.({ isDirty: true });
		onchange?.(currentData);
	}}
>
	Mark form dirty
</button>
