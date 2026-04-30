export function getItemReferences(item: {
	_tentmanId?: string;
	id?: string;
	slug?: string;
	filename?: string;
}): string[];

export function orderByReferences<T>(
	items: T[],
	orderedReferences: string[] | undefined,
	getReferences: (item: T) => string[]
): T[];
