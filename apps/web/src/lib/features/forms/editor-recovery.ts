import type { FormEditSessionRecoveryState } from './edit-session';

const RECOVERY_STORAGE_PREFIX = 'tentman:editor-recovery:v1:';

export interface EditorRecoverySnapshot {
	version: 1;
	routeKey: string;
	contextKey: string;
	baselineFingerprint: string;
	recoveredAt: number;
	session: FormEditSessionRecoveryState;
}

export type EditorRecoveryState =
	| { kind: 'none' }
	| { kind: 'available'; snapshot: EditorRecoverySnapshot }
	| { kind: 'stale'; snapshot: EditorRecoverySnapshot };

export function buildEditorRecoveryStorageKey(routeKey: string): string {
	return `${RECOVERY_STORAGE_PREFIX}${routeKey}`;
}

export function createEditorRecoverySnapshot(input: {
	routeKey: string;
	contextKey: string;
	baselineFingerprint: string;
	session: FormEditSessionRecoveryState;
	now?: number;
}): EditorRecoverySnapshot {
	return {
		version: 1,
		routeKey: input.routeKey,
		contextKey: input.contextKey,
		baselineFingerprint: input.baselineFingerprint,
		recoveredAt: input.now ?? Date.now(),
		session: input.session
	};
}

export function writeEditorRecoverySnapshot(
	storage: Storage,
	snapshot: EditorRecoverySnapshot
): void {
	try {
		storage.setItem(
			buildEditorRecoveryStorageKey(snapshot.routeKey),
			JSON.stringify(snapshot)
		);
	} catch {
		// Ignore storage write failures so editing can continue without recovery persistence.
	}
}

export function clearEditorRecoverySnapshot(storage: Storage, routeKey: string): void {
	try {
		storage.removeItem(buildEditorRecoveryStorageKey(routeKey));
	} catch {
		// Ignore storage cleanup failures for the same reason as writes.
	}
}

export function readEditorRecoverySnapshot(
	storage: Storage,
	routeKey: string
): EditorRecoverySnapshot | null {
	let serialized: string | null = null;
	try {
		serialized = storage.getItem(buildEditorRecoveryStorageKey(routeKey));
	} catch {
		return null;
	}

	if (!serialized) {
		return null;
	}

	try {
		const parsed = JSON.parse(serialized) as EditorRecoverySnapshot;
		if (parsed.version !== 1) {
			clearEditorRecoverySnapshot(storage, routeKey);
			return null;
		}
		return parsed;
	} catch {
		clearEditorRecoverySnapshot(storage, routeKey);
		return null;
	}
}

export function resolveEditorRecoveryState(input: {
	storage: Storage;
	routeKey: string;
	contextKey: string;
	baselineFingerprint: string;
}): EditorRecoveryState {
	const snapshot = readEditorRecoverySnapshot(input.storage, input.routeKey);
	if (!snapshot || snapshot.contextKey !== input.contextKey) {
		return { kind: 'none' };
	}

	return snapshot.baselineFingerprint === input.baselineFingerprint
		? { kind: 'available', snapshot }
		: { kind: 'stale', snapshot };
}

export function getContentFingerprint(value: unknown): string {
	return JSON.stringify(value);
}
