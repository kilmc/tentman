<script lang="ts">
	import { getMockFormGeneratorResult } from '$lib/test/mock-form-generator';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { ValidationError } from '$lib/utils/validation';

	interface Props {
		onvalidate?: (data: ContentRecord, errors: ValidationError[]) => void;
	}

	let { onvalidate }: Props = $props();

	export function validate() {
		const result = getMockFormGeneratorResult();
		onvalidate?.(result.data, result.errors);
		return result;
	}

	export function getData() {
		return getMockFormGeneratorResult().data;
	}
</script>

<div data-testid="mock-form-generator"></div>
