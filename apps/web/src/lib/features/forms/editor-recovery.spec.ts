import { describe, expect, it } from 'vitest';
import {
	clearEditorRecoverySnapshot,
	createEditorRecoverySnapshot,
	readEditorRecoverySnapshot,
	resolveEditorRecoveryState,
	writeEditorRecoverySnapshot
} from './editor-recovery';

function createMemoryStorage(): Storage {
	const data = new Map<string, string>();

	return {
		get length() {
			return data.size;
		},
		clear() {
			data.clear();
		},
		getItem(key) {
			return data.get(key) ?? null;
		},
		key(index) {
			return [...data.keys()][index] ?? null;
		},
		removeItem(key) {
			data.delete(key);
		},
		setItem(key, value) {
			data.set(key, value);
		}
	};
}

describe('features/forms/editor-recovery', () => {
	it('returns an available recovery when the route, context, and baseline match', () => {
		const storage = createMemoryStorage();
		const snapshot = createEditorRecoverySnapshot({
			routeKey: '/pages/about/edit',
			contextKey: 'github:acme/docs:live',
			baselineFingerprint: '{"title":"About"}',
			session: {
				data: { title: 'Recovered about' },
				baseline: { title: 'About' },
				panelStack: []
			},
			now: 123
		});

		writeEditorRecoverySnapshot(storage, snapshot);

		expect(
			resolveEditorRecoveryState({
				storage,
				routeKey: '/pages/about/edit',
				contextKey: 'github:acme/docs:live',
				baselineFingerprint: '{"title":"About"}'
			})
		).toEqual({
			kind: 'available',
			snapshot
		});
	});

	it('returns a stale recovery when the saved baseline changed', () => {
		const storage = createMemoryStorage();
		writeEditorRecoverySnapshot(
			storage,
			createEditorRecoverySnapshot({
				routeKey: '/pages/posts/hello-world/edit',
				contextKey: 'github:acme/docs:preview',
				baselineFingerprint: '{"title":"Hello world"}',
				session: {
					data: { title: 'Recovered hello world' },
					baseline: { title: 'Hello world' },
					panelStack: []
				}
			})
		);

		expect(
			resolveEditorRecoveryState({
				storage,
				routeKey: '/pages/posts/hello-world/edit',
				contextKey: 'github:acme/docs:preview',
				baselineFingerprint: '{"title":"Hello again"}'
			})
		).toMatchObject({
			kind: 'stale'
		});
	});

	it('ignores recovery written for a different context and clears snapshots explicitly', () => {
		const storage = createMemoryStorage();
		writeEditorRecoverySnapshot(
			storage,
			createEditorRecoverySnapshot({
				routeKey: '/pages/posts/new',
				contextKey: 'github:acme/docs:live',
				baselineFingerprint: '{}',
				session: {
					data: { title: 'Recovered draft' },
					baseline: {},
					panelStack: []
				}
			})
		);

		expect(
			resolveEditorRecoveryState({
				storage,
				routeKey: '/pages/posts/new',
				contextKey: 'github:other/docs:live',
				baselineFingerprint: '{}'
			})
		).toEqual({ kind: 'none' });

		clearEditorRecoverySnapshot(storage, '/pages/posts/new');
		expect(readEditorRecoverySnapshot(storage, '/pages/posts/new')).toBeNull();
	});
});
