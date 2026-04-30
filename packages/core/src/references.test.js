import assert from 'node:assert/strict';
import test from 'node:test';
import { getItemReferences, orderByReferences } from './index.js';

test('orders items by stable ids and legacy references while preserving remaining order', () => {
	const items = [
		{
			_tentmanId: 'tent_post_a',
			slug: 'alpha',
			filename: 'alpha.md',
			title: 'Alpha'
		},
		{
			_tentmanId: 'tent_post_b',
			slug: 'bravo',
			filename: 'bravo.md',
			title: 'Bravo'
		},
		{
			_tentmanId: 'tent_post_c',
			slug: 'charlie',
			filename: 'charlie.md',
			title: 'Charlie'
		}
	];

	const ordered = orderByReferences(
		items,
		['tent_post_b', 'alpha', 'missing-reference'],
		getItemReferences
	);

	assert.deepEqual(
		ordered.map((item) => item.title),
		['Bravo', 'Alpha', 'Charlie']
	);
});
