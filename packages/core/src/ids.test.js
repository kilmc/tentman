import assert from 'node:assert/strict';
import test from 'node:test';
import { createTentmanId, describeTentmanId, isTentmanId } from './ids.js';

test('creates Tentman-owned stable ids', () => {
	const id = createTentmanId();

	assert.equal(isTentmanId(id), true);
	assert.equal(describeTentmanId(id), 'valid');
	assert.match(id, /^tent_/);
});

test('classifies missing and legacy ids', () => {
	assert.equal(describeTentmanId(undefined), 'missing');
	assert.equal(describeTentmanId('projects'), 'legacy-or-malformed');
	assert.equal(describeTentmanId('550e8400-e29b-41d4-a716-446655440000'), 'legacy-or-malformed');
});
