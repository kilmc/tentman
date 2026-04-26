import { describe, expect, it } from 'vitest';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';
import { createFormEditSession, parseFieldPath } from './edit-session';

const blockRegistry = {
	entries: [],
	get: () => undefined,
	has: () => false,
	getAdapter: () => undefined
};

function repeatablePanel(input: {
	id: string;
	mode: 'create' | 'edit';
	label: string;
	listLabel: string;
	title: string;
	blocks: BlockUsage[];
	selectedIndex: number;
	selectedItem: ContentRecord;
	arrayPath: Array<string | number>;
	itemFieldPath: string;
}) {
	return {
		kind: 'repeatable' as const,
		targetPath: [...input.arrayPath, input.selectedIndex],
		blockRegistry,
		...input
	};
}

function objectPanel(input: {
	id: string;
	label: string;
	title: string;
	blocks: BlockUsage[];
	selectedItem: ContentRecord;
	targetPath: Array<string | number>;
	itemFieldPath: string;
}) {
	return {
		kind: 'object' as const,
		mode: 'edit' as const,
		listLabel: input.label,
		blockRegistry,
		...input
	};
}

describe('features/forms/edit-session', () => {
	it('tracks root dirty state and returns clean when data matches the baseline', () => {
		const session = createFormEditSession({ title: 'About' });

		expect(session.getDirtyState().isDirty).toBe(false);

		session.updateData({ title: 'About us' });
		expect(session.getDirtyState().isDirty).toBe(true);

		session.updateData({ title: 'About' });
		expect(session.getDirtyState().isDirty).toBe(false);
	});

	it('tracks dirty edits inside an open repeatable panel before panel save', () => {
		const session = createFormEditSession({
			sections: [{ title: 'Intro' }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:sections',
				mode: 'edit',
				label: 'Section',
				listLabel: 'Sections',
				title: 'Section 1: Intro',
				blocks: [{ id: 'title', type: 'text', label: 'Title' }],
				selectedIndex: 0,
				selectedItem: { title: 'Intro' },
				arrayPath: ['sections'],
				itemFieldPath: 'sections[0]'
			})
		});
		session.updatePanelField('title', 'Opening');

		expect(session.getDirtyState()).toMatchObject({
			isDirty: true,
			hasPanelDraft: true,
			hasCreatePanelDraft: false
		});
		expect(session.getData()).toEqual({
			sections: [{ title: 'Intro' }]
		});
	});

	it('commits dirty existing panel edits when preparing outer submit', () => {
		const session = createFormEditSession({
			sections: [{ title: 'Intro' }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:sections',
				mode: 'edit',
				label: 'Section',
				listLabel: 'Sections',
				title: 'Section 1: Intro',
				blocks: [{ id: 'title', type: 'text', label: 'Title' }],
				selectedIndex: 0,
				selectedItem: { title: 'Intro' },
				arrayPath: ['sections'],
				itemFieldPath: 'sections[0]'
			})
		});
		session.updatePanelField('title', 'Opening');

		expect(session.prepareSubmit()).toEqual({
			ok: true,
			data: {
				sections: [{ title: 'Opening' }]
			}
		});
		expect(session.getActivePanel()).toBeNull();
	});

	it('blocks outer submit for dirty create panel drafts', () => {
		const session = createFormEditSession({
			sections: []
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:sections',
				mode: 'create',
				label: 'Section',
				listLabel: 'Sections',
				title: 'New Section',
				blocks: [{ id: 'title', type: 'text', label: 'Title' }],
				selectedIndex: 0,
				selectedItem: { title: '' },
				arrayPath: ['sections'],
				itemFieldPath: 'sections[0]'
			})
		});
		session.updatePanelField('title', 'Opening');

		const result = session.prepareSubmit();
		expect(result.ok).toBe(false);
		expect(result.data).toEqual({ sections: [] });
		expect(session.getActivePanel()).toMatchObject({
			mode: 'create',
			submitError: 'Add New Section or cancel before saving the page.'
		});
	});

	it('reorders top-level repeatable items and keeps the active panel index aligned', () => {
		const session = createFormEditSession({
			sections: [{ title: 'Intro' }, { title: 'Credits' }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:sections',
				mode: 'edit',
				label: 'Section',
				listLabel: 'Sections',
				title: 'Section 2: Credits',
				blocks: [{ id: 'title', type: 'text', label: 'Title' }],
				selectedIndex: 1,
				selectedItem: { title: 'Credits' },
				arrayPath: ['sections'],
				itemFieldPath: 'sections[1]'
			})
		});

		session.reorderArrayItems(
			['sections'],
			[{ title: 'Credits' }, { title: 'Intro' }],
			new Map([
				[1, 0],
				[0, 1]
			])
		);

		expect(session.getData()).toEqual({
			sections: [{ title: 'Credits' }, { title: 'Intro' }]
		});
		expect(session.getActivePanel()).toMatchObject({
			selectedIndex: 0,
			selectedItem: { title: 'Credits' }
		});
	});

	it('reorders nested repeatable items inside their parent draft', () => {
		const session = createFormEditSession({
			galleries: [{ id: 'main', images: [{ alt: 'Opening' }, { alt: 'Detail' }] }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:galleries',
				mode: 'edit',
				label: 'Gallery',
				listLabel: 'Galleries',
				title: 'Gallery 1: main',
				blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
				selectedIndex: 0,
				selectedItem: { id: 'main', images: [{ alt: 'Opening' }, { alt: 'Detail' }] },
				arrayPath: ['galleries'],
				itemFieldPath: 'galleries[0]'
			})
		});

		session.reorderArrayItems(
			['galleries', 0, 'images'],
			[{ alt: 'Detail' }, { alt: 'Opening' }],
			new Map([
				[1, 0],
				[0, 1]
			])
		);

		expect(session.getData()).toEqual({
			galleries: [{ id: 'main', images: [{ alt: 'Opening' }, { alt: 'Detail' }] }]
		});
		expect(session.getActivePanel()).toMatchObject({
			selectedItem: {
				id: 'main',
				images: [{ alt: 'Detail' }, { alt: 'Opening' }]
			},
			isDirty: true
		});

		session.commitPanel();
		expect(session.getData()).toEqual({
			galleries: [{ id: 'main', images: [{ alt: 'Detail' }, { alt: 'Opening' }] }]
		});
	});

	it('commits nested repeatable drafts through the parent draft before root data', () => {
		const session = createFormEditSession({
			galleries: [{ id: 'main', images: [] }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:galleries',
				mode: 'edit',
				label: 'Gallery',
				listLabel: 'Galleries',
				title: 'Gallery 1: main',
				blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
				selectedIndex: 0,
				selectedItem: { id: 'main', images: [] },
				arrayPath: ['galleries'],
				itemFieldPath: 'galleries[0]'
			})
		});
		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:galleries[0].images',
				mode: 'create',
				label: 'Image',
				listLabel: 'Images',
				title: 'New Image',
				blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }],
				selectedIndex: 0,
				selectedItem: { alt: '' },
				arrayPath: ['galleries', 0, 'images'],
				itemFieldPath: 'galleries[0].images[0]'
			})
		});
		session.updatePanelField('alt', 'Opening');
		session.commitPanel();

		expect(session.getData()).toEqual({
			galleries: [{ id: 'main', images: [] }]
		});
		expect(session.getActivePanel()).toMatchObject({
			title: 'Gallery 1: main',
			selectedItem: {
				id: 'main',
				images: [{ alt: 'Opening' }]
			},
			isDirty: true
		});

		session.commitPanel();
		expect(session.getData()).toEqual({
			galleries: [{ id: 'main', images: [{ alt: 'Opening' }] }]
		});
	});

	it('removes top-level and nested repeatable items', () => {
		const session = createFormEditSession({
			galleries: [{ id: 'main', images: [{ alt: 'Opening' }] }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:galleries',
				mode: 'edit',
				label: 'Gallery',
				listLabel: 'Galleries',
				title: 'Gallery 1: main',
				blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
				selectedIndex: 0,
				selectedItem: { id: 'main', images: [{ alt: 'Opening' }] },
				arrayPath: ['galleries'],
				itemFieldPath: 'galleries[0]'
			})
		});
		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:galleries[0].images',
				mode: 'edit',
				label: 'Image',
				listLabel: 'Images',
				title: 'Image 1: Opening',
				blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }],
				selectedIndex: 0,
				selectedItem: { alt: 'Opening' },
				arrayPath: ['galleries', 0, 'images'],
				itemFieldPath: 'galleries[0].images[0]'
			})
		});

		session.removePanelItem();
		expect(session.getActivePanel()).toMatchObject({
			selectedItem: {
				id: 'main',
				images: []
			}
		});
		session.commitPanel();
		expect(session.getData()).toEqual({
			galleries: [{ id: 'main', images: [] }]
		});

		session.openPanel({
			...repeatablePanel({
				id: 'repeatable:galleries',
				mode: 'edit',
				label: 'Gallery',
				listLabel: 'Galleries',
				title: 'Gallery 1: main',
				blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
				selectedIndex: 0,
				selectedItem: { id: 'main', images: [] },
				arrayPath: ['galleries'],
				itemFieldPath: 'galleries[0]'
			})
		});
		session.removePanelItem();
		expect(session.getData()).toEqual({ galleries: [] });
	});

	it('keeps object panel edits in draft state until the panel is committed', () => {
		const session = createFormEditSession({
			gallery: {
				layout: 'grid',
				images: []
			}
		});

		session.openPanel(
			objectPanel({
				id: 'object:gallery',
				label: 'Gallery',
				title: 'Gallery',
				blocks: [
					{ id: 'layout', type: 'text', label: 'Layout' },
					{
						id: 'images',
						type: 'block',
						label: 'Images',
						collection: true,
						blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
					}
				],
				selectedItem: { layout: 'grid', images: [] },
				targetPath: ['gallery'],
				itemFieldPath: 'gallery'
			})
		);
		session.updatePanelField('layout', 'masonry');

		expect(session.getData()).toEqual({
			gallery: {
				layout: 'grid',
				images: []
			}
		});
		expect(session.getActivePanel()).toMatchObject({
			kind: 'object',
			selectedItem: {
				layout: 'masonry',
				images: []
			},
			isDirty: true
		});

		session.commitPanel();

		expect(session.getData()).toEqual({
			gallery: {
				layout: 'masonry',
				images: []
			}
		});
	});

	it('stages nested repeatable changes inside an object panel before root submit', () => {
		const session = createFormEditSession({
			gallery: {
				layout: 'grid',
				images: []
			}
		});

		session.openPanel(
			objectPanel({
				id: 'object:gallery',
				label: 'Gallery',
				title: 'Gallery',
				blocks: [
					{ id: 'layout', type: 'text', label: 'Layout' },
					{
						id: 'images',
						type: 'block',
						label: 'Images',
						collection: true,
						blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
					}
				],
				selectedItem: { layout: 'grid', images: [] },
				targetPath: ['gallery'],
				itemFieldPath: 'gallery'
			})
		);
		session.openPanel(
			repeatablePanel({
				id: 'repeatable:gallery.images',
				mode: 'create',
				label: 'Image',
				listLabel: 'Images',
				title: 'New Image',
				blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }],
				selectedIndex: 0,
				selectedItem: { alt: '' },
				arrayPath: ['gallery', 'images'],
				itemFieldPath: 'gallery.images[0]'
			})
		);
		session.updatePanelField('alt', 'Opening');
		session.commitPanel();

		expect(session.getData()).toEqual({
			gallery: {
				layout: 'grid',
				images: []
			}
		});
		expect(session.getActivePanel()).toMatchObject({
			kind: 'object',
			selectedItem: {
				layout: 'grid',
				images: [{ alt: 'Opening' }]
			},
			isDirty: true
		});

		expect(session.prepareSubmit()).toEqual({
			ok: true,
			data: {
				gallery: {
					layout: 'grid',
					images: [{ alt: 'Opening' }]
				}
			}
		});
	});

	it('parses field paths with array indices', () => {
		expect(parseFieldPath('galleries[0].images[2].alt')).toEqual([
			'galleries',
			0,
			'images',
			2,
			'alt'
		]);
	});
});
