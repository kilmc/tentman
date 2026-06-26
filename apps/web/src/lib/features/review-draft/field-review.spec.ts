import { describe, expect, it } from 'vitest';
import { buildFieldChanges } from './field-review';

const repoAssetContext = {
	owner: 'acme',
	repo: 'docs',
	baseBranch: 'main',
	draftBranch: 'tentman-preview'
};

const assets = {
	path: './static/images/projects',
	publicPath: '/images/projects'
};

const fieldOptions = {
	repoAssetContext,
	baseAssets: assets,
	draftAssets: assets
};

describe('review draft field review', () => {
	it('excludes unchanged fields from edited item detail', () => {
		const fields = buildFieldChanges(
			[
				{ id: 'title', type: 'text', label: 'Title' },
				{ id: 'body', type: 'markdown', label: 'Body' }
			] as never,
			{
				title: 'Before',
				body: 'Same body'
			},
			{
				title: 'After',
				body: 'Same body'
			},
			fieldOptions
		);

		expect(fields).toHaveLength(1);
		expect(fields[0]).toMatchObject({
			fieldId: 'title',
			label: 'Title'
		});
	});

	it('switches repeatable structured blocks into contextual before/after review when order changes', () => {
		const [field] = buildFieldChanges(
			[
				{
					id: 'sections',
					type: 'block',
					label: 'Sections',
					collection: true,
					blocks: [{ id: 'heading', type: 'text', label: 'Heading' }]
				}
			] as never,
			{
				sections: [
					{ id: 'intro', heading: 'Intro' },
					{ id: 'details', heading: 'Details' }
				]
			},
			{
				sections: [
					{ id: 'details', heading: 'Details' },
					{ id: 'intro', heading: 'Intro' }
				]
			},
			fieldOptions
		);

		expect(field.presentation).toMatchObject({
			kind: 'structured',
			mode: 'context',
			beforeSummary: ['Intro (moved to 2)', 'Details (moved to 1)'],
			afterSummary: ['Details (moved from 2)', 'Intro (moved from 1)']
		});
	});

	it('shows contextual whole-list review when repeatable structured blocks add or remove stable items', () => {
		const [field] = buildFieldChanges(
			[
				{
					id: 'sections',
					type: 'block',
					label: 'Sections',
					collection: true,
					blocks: [{ id: 'heading', type: 'text', label: 'Heading' }]
				}
			] as never,
			{
				sections: [
					{ id: 'intro', heading: 'Intro' },
					{ id: 'details', heading: 'Details' }
				]
			},
			{
				sections: [
					{ id: 'details', heading: 'Details updated' },
					{ id: 'summary', heading: 'Summary' }
				]
			},
			fieldOptions
		);

		expect(field.presentation).toMatchObject({
			kind: 'structured',
			mode: 'context',
			beforeSummary: ['Intro (removed)', 'Details (moved to 1, edited)'],
			afterSummary: ['Details updated (moved from 2, edited)', 'Summary (new)']
		});
	});

	it('builds image review previews from root assets instead of block assetsDir', () => {
		const [field] = buildFieldChanges(
			[
				{
					id: 'hero',
					type: 'image',
					label: 'Hero',
					assetsDir: './legacy-images'
				}
			] as never,
			{
				hero: 'before.jpg'
			},
			{
				hero: '/images/projects/after.jpg'
			},
			fieldOptions
		);

		expect(field.presentation).toMatchObject({
			kind: 'media',
			before: {
				previewUrl:
					'/api/repo/asset?value=before.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
			},
			after: {
				previewUrl:
					'/api/repo/asset?value=%2Fimages%2Fprojects%2Fafter.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=tentman-preview'
			}
		});
	});
});
