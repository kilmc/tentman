import { describe, expect, it } from 'vitest';
import type { ParsedContentConfig } from '$lib/config/parse';
import {
	resolveCollectionItemState,
	resolveContentState
} from '$lib/features/content-management/state';

const configWithState: ParsedContentConfig = {
	type: 'content',
	label: 'Posts',
	itemLabel: 'Post',
	state: {
		blockId: 'published',
		preset: 'publication',
		visibility: {
			card: false
		}
	},
	collection: {
		sorting: 'manual',
		state: {
			blockId: 'published',
			preset: 'publication',
			cases: [{ value: 'scheduled', label: 'Scheduled', variant: 'accent', icon: 'clock' }],
			visibility: {
				header: false
			}
		}
	},
	content: {
		mode: 'directory',
		path: './posts',
		template: './post.md'
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title' },
		{ id: 'published', type: 'toggle', label: 'Published' },
		{
			id: 'status',
			type: 'select',
			label: 'Status',
			options: [{ value: 'scheduled', label: 'Scheduled' }]
		}
	]
};

describe('content state resolution', () => {
	it('resolves top-level content state from a shared preset', () => {
		expect(
			resolveContentState(
				configWithState,
				{ published: false },
				{
					statePresets: {
						publication: {
							cases: [
								{
									value: false,
									label: 'Draft',
									variant: 'warning',
									icon: 'file-pen'
								}
							]
						}
					}
				}
			)
		).toEqual({
			value: false,
			label: 'Draft',
			variant: 'warning',
			icon: 'file-pen',
			visibility: {
				navigation: true,
				header: true,
				card: false
			}
		});
	});

	it('resolves collection state and merges preset cases with local overrides', () => {
		const collectionConfig: ParsedContentConfig = {
			...configWithState,
			collection: {
				sorting: 'manual',
				state: {
					blockId: 'status',
					preset: 'releaseStatus',
					cases: [{ value: 'scheduled', label: 'Premiere', variant: 'accent', icon: 'clock' }]
				}
			}
		};

		expect(
			resolveCollectionItemState(
				collectionConfig,
				{ status: 'scheduled' },
				{
					statePresets: {
						releaseStatus: {
							cases: [
								{ value: 'scheduled', label: 'Scheduled', variant: 'warning', icon: 'clock' }
							]
						}
					}
				}
			)
		).toEqual({
			value: 'scheduled',
			label: 'Premiere',
			variant: 'accent',
			icon: 'clock',
			visibility: {
				navigation: true,
				header: true,
				card: true
			}
		});
	});

	it('returns null when no case matches', () => {
		expect(
			resolveCollectionItemState(configWithState, { published: true }, { statePresets: {} })
		).toBeNull();
	});
});
