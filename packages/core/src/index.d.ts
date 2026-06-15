export * from './content-components.js';

export interface TentmanDiagnostic {
	level: 'error' | 'warning';
	code: string;
	message: string;
	path?: string;
}

export interface TentmanProject {
	rootDir: string;
	componentsDir: string;
	configs: Array<Record<string, unknown>>;
	contentByConfigPath: Map<string, Record<string, unknown>>;
}

export interface NavigationManifest {
	version: 1;
	content?: Record<string, unknown>;
	collections?: Record<string, unknown>;
}

export const ROOT_CONFIG_PATH: string;
export const NAVIGATION_MANIFEST_PATH: string;
export const TENTMAN_ID_PREFIX: string;
export const TENTMAN_ID_PATTERN: RegExp;

export class TentmanProjectError extends Error {
	code: string;
	path?: string;
}

export function createTentmanId(): string;
export function describeTentmanId(value: string): string;
export function isTentmanId(value: string): boolean;
export function parseNavigationManifest(source: string): NavigationManifest;
export function serializeNavigationManifest(manifest: NavigationManifest): string;
export function detectJsonIndent(source: string): string;
export function isMarkdownContentPath(filePath: string): boolean;
export function parseContentRecordFile(filePath: string, source: string): Record<string, unknown>;
export function parseMarkdownContentRecord(source: string): Record<string, unknown>;
export function serializeContentRecordFile(filePath: string, record: Record<string, unknown>): string;
export function serializeMarkdownContentRecord(record: Record<string, unknown>): string;
export function updateContentRecordFileSource(
	filePath: string,
	source: string,
	record: Record<string, unknown>
): string;
export function resolveTentmanProjectRoot(projectRoot: string): Promise<string>;
export function parseRootConfig(source: string): Record<string, unknown>;
export function loadTentmanProject(projectRoot: string): Promise<TentmanProject>;
export function doctorTentmanProject(project: TentmanProject): Promise<TentmanDiagnostic[]>;
export function checkNavigationManifest(project: TentmanProject): Promise<TentmanDiagnostic[]>;
export function checkTentmanIds(project: TentmanProject): Promise<TentmanDiagnostic[]>;
export function checkContentComponentReferenceBindings(
	project: TentmanProject
): Promise<TentmanDiagnostic[]>;
export function checkTentmanFormat(project: TentmanProject): Promise<Array<Record<string, unknown>>>;
export function writeTentmanFormat(project: TentmanProject): Promise<Array<Record<string, unknown>>>;
export function summarizeFormatCheck(rewrites: Array<Record<string, unknown>>): Record<string, number>;
export function runTentmanCi(project: TentmanProject): Promise<Record<string, unknown>>;
export function checkTentmanAssets(project: TentmanProject): Promise<TentmanDiagnostic[]>;
export function listTentmanAssets(
	project: TentmanProject,
	selector?: string
): Promise<Record<string, unknown> | Array<Record<string, unknown>>>;
export function findUnusedTentmanAssets(
	project: TentmanProject,
	selector?: string
): Promise<Array<Record<string, unknown>>>;
export function inspectTentmanContent(
	project: TentmanProject,
	configReference: string,
	itemReference?: string
): Promise<Record<string, unknown>>;
export function listTentmanContent(
	project: TentmanProject,
	configReference?: string
): Promise<Record<string, unknown> | Array<Record<string, unknown>>>;
export function renderContentComponent(
	component: import('./content-components.js').ContentComponent,
	instance: import('./content-components.js').ContentComponentInstance
): string;
export function resolveTentmanMarkdownFileRenderContext(
	projectRoot: string,
	filePath: string
): Promise<Record<string, unknown> | null>;
export function validateContentComponentReferenceBindings(
	project: TentmanProject
): Promise<TentmanDiagnostic[]>;
export function createContentComponentScaffold(
	projectRoot: string,
	name: string,
	options?: { kind?: 'inline' | 'block' }
): Promise<Record<string, unknown>>;
export function inspectTentmanContentComponent(
	project: TentmanProject,
	reference: string
): Promise<Record<string, unknown>>;
export function listTentmanContentComponents(
	project: TentmanProject
): Promise<Array<Record<string, unknown>>>;
export function validateTentmanContentComponents(project: TentmanProject): Promise<TentmanDiagnostic[]>;
export function getTentmanSchema(
	project: TentmanProject,
	configReference?: string
): Promise<Record<string, unknown>>;
export function explainTentmanNavigation(
	project: TentmanProject,
	configReference: string,
	itemReference?: string
): Promise<Record<string, unknown>>;
export function printTentmanNavigation(
	project: TentmanProject,
	configReference?: string
): Promise<string>;
export function getConfigReferences(config: Record<string, unknown>): string[];
export function getItemReferences(item: Record<string, unknown>): string[];
export function orderByReferences<T>(items: T[], references: string[], getReferences: (item: T) => string[]): T[];
export function refreshNavigationManifest(project: TentmanProject): Promise<Record<string, unknown>>;
export function summarizeNavigationRefreshChanges(result: Record<string, unknown>): Record<string, number>;
export function rebuildNavigationManifest(project: TentmanProject): Promise<Record<string, unknown>>;
export function writeMissingTentmanIds(project: TentmanProject): Promise<Record<string, unknown>>;
export function summarizeIdWriteChanges(result: Record<string, unknown>): Record<string, number>;

