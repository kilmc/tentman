import type { ReviewDiffLine, ReviewDiffSegment } from './types';

function buildLcsMatrix<T>(before: T[], after: T[]): number[][] {
	const matrix = Array.from({ length: before.length + 1 }, () =>
		Array.from({ length: after.length + 1 }, () => 0)
	);

	for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
		for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
			if (before[beforeIndex] === after[afterIndex]) {
				matrix[beforeIndex][afterIndex] = matrix[beforeIndex + 1][afterIndex + 1] + 1;
				continue;
			}

			matrix[beforeIndex][afterIndex] = Math.max(
				matrix[beforeIndex + 1][afterIndex],
				matrix[beforeIndex][afterIndex + 1]
			);
		}
	}

	return matrix;
}

function buildDiffParts<T extends string>(
	before: T[],
	after: T[]
): {
	beforeParts: Array<{ value: T; status: 'unchanged' | 'removed' }>;
	afterParts: Array<{ value: T; status: 'unchanged' | 'added' }>;
} {
	const matrix = buildLcsMatrix(before, after);
	const beforeParts: Array<{ value: T; status: 'unchanged' | 'removed' }> = [];
	const afterParts: Array<{ value: T; status: 'unchanged' | 'added' }> = [];

	let beforeIndex = 0;
	let afterIndex = 0;

	while (beforeIndex < before.length && afterIndex < after.length) {
		if (before[beforeIndex] === after[afterIndex]) {
			beforeParts.push({ value: before[beforeIndex], status: 'unchanged' });
			afterParts.push({ value: after[afterIndex], status: 'unchanged' });
			beforeIndex += 1;
			afterIndex += 1;
			continue;
		}

		if (matrix[beforeIndex + 1][afterIndex] >= matrix[beforeIndex][afterIndex + 1]) {
			beforeParts.push({ value: before[beforeIndex], status: 'removed' });
			beforeIndex += 1;
			continue;
		}

		afterParts.push({ value: after[afterIndex], status: 'added' });
		afterIndex += 1;
	}

	while (beforeIndex < before.length) {
		beforeParts.push({ value: before[beforeIndex], status: 'removed' });
		beforeIndex += 1;
	}

	while (afterIndex < after.length) {
		afterParts.push({ value: after[afterIndex], status: 'added' });
		afterIndex += 1;
	}

	return { beforeParts, afterParts };
}

function tokenizeInline(value: string): string[] {
	return value.split(/(\s+)/).filter((part) => part.length > 0);
}

export function buildInlineDiff(
	before: string,
	after: string
): { beforeSegments: ReviewDiffSegment[]; afterSegments: ReviewDiffSegment[] } {
	const diff = buildDiffParts(tokenizeInline(before), tokenizeInline(after));

	return {
		beforeSegments: diff.beforeParts,
		afterSegments: diff.afterParts
	};
}

export function buildLineDiff(
	before: string,
	after: string
): { beforeLines: ReviewDiffLine[]; afterLines: ReviewDiffLine[] } {
	const diff = buildDiffParts(before.split('\n'), after.split('\n'));

	return {
		beforeLines: diff.beforeParts,
		afterLines: diff.afterParts
	};
}
