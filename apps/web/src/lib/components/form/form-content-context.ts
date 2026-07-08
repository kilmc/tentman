import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
import type { SemanticFieldFingerprint } from '$lib/features/forms/edit-session';

export const FORM_CONTENT_CONTEXT = Symbol('form-content');

export interface FormContentContext {
	getRootBlocks(): BlockUsage[];
	getRootData(): ContentRecord;
	getBlockRegistry(): BlockRegistry;
	getBaselineFieldValue?(path: string): ContentValue | undefined;
	updateSemanticFieldFingerprint?(fingerprint: SemanticFieldFingerprint): void;
}
