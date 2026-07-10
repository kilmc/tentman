import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';
import { buildPathWithQuery } from '$lib/utils/routing';

type Fetcher = typeof fetch;

export function hasTagsBlock(blocks: BlockUsage[] | null | undefined): boolean {
	if (!Array.isArray(blocks)) {
		return false;
	}

	return blocks.some((block) => {
		if (block.type === 'tags') {
			return true;
		}

		return block.type === 'block' && Array.isArray(block.blocks)
			? hasTagsBlock(block.blocks)
			: false;
	});
}

export async function loadCollectionExistingItems(
	fetcher: Fetcher,
	slug: string
): Promise<ContentRecord[]> {
	const indexResponse = await fetcher(buildPathWithQuery('/api/repo/collection-index', { slug }));
	if (!indexResponse.ok) {
		return [];
	}

	const index = await indexResponse.json();
	const blobShas = Array.isArray(index?.items)
		? index.items
				.map((item: { blobSha?: unknown }) => item.blobSha)
				.filter((blobSha: unknown): blobSha is string => typeof blobSha === 'string')
		: [];

	if (blobShas.length === 0) {
		return [];
	}

	const projectionResponse = await fetcher('/api/repo/collection-projections', {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify({ slug, blobShas })
	});

	if (!projectionResponse.ok) {
		return [];
	}

	const projection = await projectionResponse.json();
	return Array.isArray(projection?.items) ? projection.items : [];
}
