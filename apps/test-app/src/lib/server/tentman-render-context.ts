import { resolve } from 'node:path';
import { getTentmanContentComponentApi } from './tentman-content-components.js';

type ContentRecord = Record<string, unknown>;
type ProjectBlock = {
	id?: string;
	error?: string;
	raw?: {
		blocks?: Array<Record<string, unknown>>;
	};
};

let projectPromise: Promise<any> | null = null;

async function getProject() {
	const { loadTentmanProject } = await getTentmanContentComponentApi();

	if (!projectPromise || (import.meta.env?.DEV ?? false)) {
		projectPromise = loadTentmanProject(process.cwd());
	}

	return projectPromise;
}

export async function getMarkdownRenderContext(configId: string, contentItem: ContentRecord) {
	const project = await getProject();
	const sourcePath =
		typeof contentItem.__tentmanSourcePath === 'string' ? contentItem.__tentmanSourcePath : null;

	if (sourcePath) {
		const { resolveTentmanMarkdownFileRenderContext } = await getTentmanContentComponentApi();
		const resolvedContext = resolveTentmanMarkdownFileRenderContext(project, resolve(process.cwd(), sourcePath));

		if (resolvedContext) {
			return resolvedContext;
		}
	}

	const config = project.configs.find((entry) => entry.id === configId || entry.slug === configId);
	if (!config) {
		throw new Error(`Unknown Tentman config: ${configId}`);
	}

	const reusableBlocksById = new Map(
		(project.blocks as ProjectBlock[])
			.filter((block) => !block.error && typeof block.id === 'string')
			.map((block) => [block.id as string, block])
	);

	return {
		blocks: config.raw.blocks as Array<Record<string, unknown>>,
		contentItem,
		resolveStructuredBlocks(block: Record<string, unknown>) {
			if (Array.isArray(block.blocks)) {
				return block.blocks as Array<Record<string, unknown>>;
			}

			if (typeof block.type !== 'string') {
				return null;
			}

			return reusableBlocksById.get(block.type)?.raw?.blocks ?? null;
		}
	};
}
