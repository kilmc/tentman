<script lang="ts">
	import { getMockFormGeneratorResult } from '$lib/test/mock-form-generator';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { ValidationError } from '$lib/utils/validation';

	interface Props {
		onvalidate?: (data: ContentRecord, errors: ValidationError[]) => void;
		ondirtystatechange?: (state: { isDirty: boolean }) => void;
	}

	let { onvalidate, ondirtystatechange }: Props = $props();

	export function validate() {
		const result = getMockFormGeneratorResult();
		onvalidate?.(result.data, result.errors);
		return result;
	}

	export function prepareSubmit() {
		const result = getMockFormGeneratorResult();
		onvalidate?.(result.data, result.errors);
		return {
			ok: result.errors.length === 0,
			data: result.data,
			errors: result.errors,
			message: result.errors[0]?.message
		};
	}

	export function getData() {
		return getMockFormGeneratorResult().data;
	}
</script>

<div data-testid="mock-form-generator"></div>
<button
	type="button"
	data-testid="mock-form-dirty"
	onclick={() => ondirtystatechange?.({ isDirty: true })}
>
	Mark form dirty
</button>
