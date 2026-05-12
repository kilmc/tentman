import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';

export const FORM_CONTENT_CONTEXT = Symbol('form-content');

export interface FormContentContext {
	getRootBlocks(): BlockUsage[];
	getRootData(): ContentRecord;
	getBlockRegistry(): BlockRegistry;
}
