import type { ContentValue } from '$lib/features/content-management/types';
import type { SelectBlockOptions } from '$lib/config/types';

export interface BlockAdapterUsage {
	id: string;
	type: string;
	label?: string;
	required?: boolean;
	collection?: boolean;
	minLength?: number;
	maxLength?: number;
	options?: SelectBlockOptions;
}

export interface BlockAdapter {
	type: string;
	getDefaultValue(usage: BlockAdapterUsage): ContentValue;
	validate?(value: ContentValue | undefined, usage: BlockAdapterUsage): string[];
}
