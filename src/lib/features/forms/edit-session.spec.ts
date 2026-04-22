import { describe, expect, it } from 'vitest';
import { createFormEditSession, parseFieldPath } from './edit-session';

const blockRegistry = {
	entries: [],
	get: () => undefined,
	has: () => false,
	getAdapter: () => undefined
};

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
			id: 'repeatable:sections',
			mode: 'edit',
			label: 'Section',
			listLabel: 'Sections',
			title: 'Section 1: Intro',
			blocks: [{ id: 'title', type: 'text', label: 'Title' }],
			selectedIndex: 0,
			selectedItem: { title: 'Intro' },
			arrayPath: ['sections'],
			fieldPath: 'sections',
			blockRegistry
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
			id: 'repeatable:sections',
			mode: 'edit',
			label: 'Section',
			listLabel: 'Sections',
			title: 'Section 1: Intro',
			blocks: [{ id: 'title', type: 'text', label: 'Title' }],
			selectedIndex: 0,
			selectedItem: { title: 'Intro' },
			arrayPath: ['sections'],
			fieldPath: 'sections',
			blockRegistry
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
			id: 'repeatable:sections',
			mode: 'create',
			label: 'Section',
			listLabel: 'Sections',
			title: 'New Section',
			blocks: [{ id: 'title', type: 'text', label: 'Title' }],
			selectedIndex: 0,
			selectedItem: { title: '' },
			arrayPath: ['sections'],
			fieldPath: 'sections',
			blockRegistry
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
			id: 'repeatable:sections',
			mode: 'edit',
			label: 'Section',
			listLabel: 'Sections',
			title: 'Section 2: Credits',
			blocks: [{ id: 'title', type: 'text', label: 'Title' }],
			selectedIndex: 1,
			selectedItem: { title: 'Credits' },
			arrayPath: ['sections'],
			fieldPath: 'sections',
			blockRegistry
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
			id: 'repeatable:galleries',
			mode: 'edit',
			label: 'Gallery',
			listLabel: 'Galleries',
			title: 'Gallery 1: main',
			blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
			selectedIndex: 0,
			selectedItem: { id: 'main', images: [{ alt: 'Opening' }, { alt: 'Detail' }] },
			arrayPath: ['galleries'],
			fieldPath: 'galleries',
			blockRegistry
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
			id: 'repeatable:galleries',
			mode: 'edit',
			label: 'Gallery',
			listLabel: 'Galleries',
			title: 'Gallery 1: main',
			blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
			selectedIndex: 0,
			selectedItem: { id: 'main', images: [] },
			arrayPath: ['galleries'],
			fieldPath: 'galleries',
			blockRegistry
		});
		session.openPanel({
			id: 'repeatable:galleries[0].images',
			mode: 'create',
			label: 'Image',
			listLabel: 'Images',
			title: 'New Image',
			blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }],
			selectedIndex: 0,
			selectedItem: { alt: '' },
			arrayPath: ['galleries', 0, 'images'],
			fieldPath: 'galleries[0].images',
			blockRegistry
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
			id: 'repeatable:galleries',
			mode: 'edit',
			label: 'Gallery',
			listLabel: 'Galleries',
			title: 'Gallery 1: main',
			blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
			selectedIndex: 0,
			selectedItem: { id: 'main', images: [{ alt: 'Opening' }] },
			arrayPath: ['galleries'],
			fieldPath: 'galleries',
			blockRegistry
		});
		session.openPanel({
			id: 'repeatable:galleries[0].images',
			mode: 'edit',
			label: 'Image',
			listLabel: 'Images',
			title: 'Image 1: Opening',
			blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }],
			selectedIndex: 0,
			selectedItem: { alt: 'Opening' },
			arrayPath: ['galleries', 0, 'images'],
			fieldPath: 'galleries[0].images',
			blockRegistry
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
			id: 'repeatable:galleries',
			mode: 'edit',
			label: 'Gallery',
			listLabel: 'Galleries',
			title: 'Gallery 1: main',
			blocks: [{ id: 'id', type: 'text', label: 'Gallery ID' }],
			selectedIndex: 0,
			selectedItem: { id: 'main', images: [] },
			arrayPath: ['galleries'],
			fieldPath: 'galleries',
			blockRegistry
		});
		session.removePanelItem();
		expect(session.getData()).toEqual({ galleries: [] });
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
