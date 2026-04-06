import type { ContentRecord } from '$lib/features/content-management/types';
import type { ValidationError } from '$lib/utils/validation';

interface MockFormGeneratorResult {
	data: ContentRecord;
	errors: ValidationError[];
}

let mockFormGeneratorResult: MockFormGeneratorResult = {
	data: {},
	errors: []
};

export function setMockFormGeneratorResult(result: MockFormGeneratorResult): void {
	mockFormGeneratorResult = result;
}

export function getMockFormGeneratorResult(): MockFormGeneratorResult {
	return mockFormGeneratorResult;
}
