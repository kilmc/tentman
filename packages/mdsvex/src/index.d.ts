export interface TentmanComponentsOptions {
	projectRoot?: string;
	componentsDir?: string;
	strict?: boolean;
	resolveTentmanContext?: 'auto' | false;
	contentItem?: Record<string, unknown>;
	blocks?: Array<Record<string, unknown>>;
	resolveStructuredBlocks?: (block: Record<string, unknown>) => Array<Record<string, unknown>> | null;
}

export function tentmanComponents(options?: TentmanComponentsOptions): () => (tree: unknown, file: unknown) => Promise<void>;

