import { isPerformanceLoggingEnabled, logTiming } from '$lib/utils/performance-logging';

const MAX_RECORDED_EVENTS = 500;
const RATE_LIMIT_HEADER_NAMES = [
	'x-ratelimit-limit',
	'x-ratelimit-remaining',
	'x-ratelimit-reset',
	'x-ratelimit-used',
	'x-ratelimit-resource'
] as const;

export type WorkflowName =
	| 'first-repository-open'
	| 'desktop-collection-landing'
	| 'warm-collection-reload'
	| 'item-route-shell'
	| 'rich-editor-interactive'
	| 'freshness'
	| 'publish-summary';

export type RequestPriority = 'foreground' | 'intent' | 'topLevel' | 'passive' | 'background';
export type RequestResultStatus = 'ok' | 'error';
export type RequestDuplicateState = 'unique' | 'duplicate' | 'deduped';
export type RequestCacheResult = 'hit' | 'miss' | 'stale' | 'write' | 'skip';
export type GitHubRequestKind =
	| 'branch'
	| 'commit'
	| 'tree'
	| 'blob'
	| 'compare'
	| 'contents'
	| 'ref'
	| 'write'
	| 'delete'
	| 'metadata';
export type WorkflowInstrumentationEvent =
	| WorkflowReadinessEvent
	| BrowserRequestTraceEvent
	| GitHubRequestTraceEvent
	| CacheOutcomeEvent
	| RouteDataFallbackEvent;

export interface WorkflowReadinessEvent {
	kind: 'workflow-readiness';
	workflow: WorkflowName;
	mark: string;
	route?: string | null;
	slug?: string | null;
	itemId?: string | null;
	timestamp: number;
}

export interface BrowserRequestTraceEvent {
	kind: 'browser-request';
	workflow: WorkflowName;
	route: string;
	endpoint: string;
	method: string;
	priority: RequestPriority;
	cacheTaskKey: string | null;
	duplicateState: RequestDuplicateState;
	durationMs: number;
	resultStatus: RequestResultStatus;
	responseStatus: number | null;
	timestamp: number;
}

export interface GitHubRateLimitHeaders {
	limit: string | null;
	remaining: string | null;
	reset: string | null;
	used: string | null;
	resource: string | null;
}

export interface GitHubRequestTraceEvent {
	kind: 'github-request';
	source: string;
	operation: string;
	requestKind: GitHubRequestKind;
	repoKey: string;
	owner?: string | null;
	repo?: string | null;
	ref?: string | null;
	path?: string | null;
	sha?: string | null;
	durationMs: number;
	resultStatus: RequestResultStatus;
	responseStatus: number | null;
	rateLimit: GitHubRateLimitHeaders;
	retryAfter: string | null;
	cacheResult?: RequestCacheResult | null;
	dedupeState?: RequestDuplicateState | null;
	timestamp: number;
}

export interface CacheOutcomeEvent {
	kind: 'cache-outcome';
	cacheArea:
		| 'snapshot'
		| 'collection-index'
		| 'projection'
		| 'item-document'
		| 'singleton-document'
		| 'block-support';
	outcome: RequestCacheResult;
	reason: string;
	repoFullName?: string | null;
	ref?: string | null;
	key?: string | null;
	slug?: string | null;
	itemId?: string | null;
	path?: string | null;
	timestamp: number;
}

export interface RouteDataFallbackEvent {
	kind: 'route-data-fallback';
	route: string;
	slug: string | null;
	itemId?: string | null;
	source: string;
	reason: string;
	timestamp: number;
}

export interface RequestBudgetAssertion {
	workflow?: WorkflowName;
	route?: string;
	maxBrowserRequests?: number;
	maxGitHubRequests?: number;
	maxRequests?: number;
	maxDurationMs?: number;
}

let captureForTests = false;
const recordedEvents: WorkflowInstrumentationEvent[] = [];

function now(): number {
	return Date.now();
}

function readHeader(headers: unknown, name: string): string | null {
	if (!headers) {
		return null;
	}

	if (headers instanceof Headers) {
		return headers.get(name);
	}

	if (typeof headers === 'object') {
		const record = headers as Record<string, unknown>;
		const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
		return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
	}

	return null;
}

function getResponseHeaders(value: unknown): unknown {
	if (!value || typeof value !== 'object') {
		return null;
	}

	if ('headers' in value) {
		return value.headers;
	}

	if ('response' in value && value.response && typeof value.response === 'object') {
		return getResponseHeaders(value.response);
	}

	return null;
}

function getResponseStatus(value: unknown): number | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	if ('status' in value && typeof value.status === 'number') {
		return value.status;
	}

	if ('response' in value && value.response && typeof value.response === 'object') {
		return getResponseStatus(value.response);
	}

	return null;
}

function getRateLimitHeaders(headers: unknown): GitHubRateLimitHeaders {
	const [limit, remaining, reset, used, resource] = RATE_LIMIT_HEADER_NAMES.map((name) =>
		readHeader(headers, name)
	);
	return { limit, remaining, reset, used, resource };
}

function shouldRecordForTests(): boolean {
	return captureForTests || import.meta.env?.MODE === 'test';
}

function recordEvent(event: WorkflowInstrumentationEvent): void {
	if (shouldRecordForTests()) {
		recordedEvents.push(event);
		if (recordedEvents.length > MAX_RECORDED_EVENTS) {
			recordedEvents.splice(0, recordedEvents.length - MAX_RECORDED_EVENTS);
		}
	}

	if (isPerformanceLoggingEnabled()) {
		const detail = { ...event } as Record<string, unknown>;
		delete detail.kind;
		delete detail.timestamp;
		const { kind } = event;
		logTiming(kind, detail);
	}
}

export function markWorkflowReadiness(input: {
	workflow: WorkflowName;
	mark: string;
	route?: string | null;
	slug?: string | null;
	itemId?: string | null;
}): void {
	try {
		performance.mark?.(`tentman:${input.workflow}:${input.mark}`);
	} catch {
		// Performance marks are diagnostics only.
	}

	recordEvent({
		kind: 'workflow-readiness',
		workflow: input.workflow,
		mark: input.mark,
		route: input.route ?? null,
		slug: input.slug ?? null,
		itemId: input.itemId ?? null,
		timestamp: now()
	});
}

export async function traceBrowserRequest<T extends Response>(
	input: {
		workflow: WorkflowName;
		route: string;
		endpoint: string;
		method?: string;
		priority: RequestPriority;
		cacheTaskKey?: string | null;
		duplicateState?: RequestDuplicateState;
	},
	action: () => Promise<T>
): Promise<T> {
	const start = performance.now();
	try {
		const response = await action();
		recordEvent({
			kind: 'browser-request',
			workflow: input.workflow,
			route: input.route,
			endpoint: input.endpoint,
			method: input.method ?? 'GET',
			priority: input.priority,
			cacheTaskKey: input.cacheTaskKey ?? null,
			duplicateState: input.duplicateState ?? 'unique',
			durationMs: performance.now() - start,
			resultStatus: response.ok ? 'ok' : 'error',
			responseStatus: response.status,
			timestamp: now()
		});
		return response;
	} catch (error) {
		recordEvent({
			kind: 'browser-request',
			workflow: input.workflow,
			route: input.route,
			endpoint: input.endpoint,
			method: input.method ?? 'GET',
			priority: input.priority,
			cacheTaskKey: input.cacheTaskKey ?? null,
			duplicateState: input.duplicateState ?? 'unique',
			durationMs: performance.now() - start,
			resultStatus: 'error',
			responseStatus: getResponseStatus(error),
			timestamp: now()
		});
		throw error;
	}
}

export async function traceGitHubRequest<T>(
	input: {
		source: string;
		operation: string;
		requestKind: GitHubRequestKind;
		repoKey: string;
		owner?: string | null;
		repo?: string | null;
		ref?: string | null;
		path?: string | null;
		sha?: string | null;
		cacheResult?: RequestCacheResult | null;
		dedupeState?: RequestDuplicateState | null;
	},
	action: () => Promise<T>
): Promise<T> {
	const start = performance.now();
	try {
		const result = await action();
		const headers = getResponseHeaders(result);
		recordEvent({
			kind: 'github-request',
			source: input.source,
			operation: input.operation,
			requestKind: input.requestKind,
			repoKey: input.repoKey,
			owner: input.owner ?? null,
			repo: input.repo ?? null,
			ref: input.ref ?? null,
			path: input.path ?? null,
			sha: input.sha ?? null,
			durationMs: performance.now() - start,
			resultStatus: 'ok',
			responseStatus: getResponseStatus(result),
			rateLimit: getRateLimitHeaders(headers),
			retryAfter: readHeader(headers, 'retry-after'),
			cacheResult: input.cacheResult ?? null,
			dedupeState: input.dedupeState ?? null,
			timestamp: now()
		});
		return result;
	} catch (error) {
		const headers = getResponseHeaders(error);
		recordEvent({
			kind: 'github-request',
			source: input.source,
			operation: input.operation,
			requestKind: input.requestKind,
			repoKey: input.repoKey,
			owner: input.owner ?? null,
			repo: input.repo ?? null,
			ref: input.ref ?? null,
			path: input.path ?? null,
			sha: input.sha ?? null,
			durationMs: performance.now() - start,
			resultStatus: 'error',
			responseStatus: getResponseStatus(error),
			rateLimit: getRateLimitHeaders(headers),
			retryAfter: readHeader(headers, 'retry-after'),
			cacheResult: input.cacheResult ?? null,
			dedupeState: input.dedupeState ?? null,
			timestamp: now()
		});
		throw error;
	}
}

export function recordCacheOutcome(input: Omit<CacheOutcomeEvent, 'kind' | 'timestamp'>): void {
	recordEvent({
		kind: 'cache-outcome',
		...input,
		timestamp: now()
	});
}

export function logRouteDataFallback(
	input: Omit<RouteDataFallbackEvent, 'kind' | 'timestamp'>
): void {
	recordEvent({
		kind: 'route-data-fallback',
		...input,
		timestamp: now()
	});
}

export function clearWorkflowInstrumentationEventsForTests(): void {
	recordedEvents.length = 0;
}

export function captureWorkflowInstrumentationForTests(): () => void {
	captureForTests = true;
	clearWorkflowInstrumentationEventsForTests();

	return () => {
		captureForTests = false;
	};
}

export function getWorkflowInstrumentationEventsForTests(): WorkflowInstrumentationEvent[] {
	return [...recordedEvents];
}

export function assertWorkflowRequestBudgetForTests(assertion: RequestBudgetAssertion): void {
	const events = recordedEvents.filter((event) => {
		if (assertion.workflow && 'workflow' in event && event.workflow !== assertion.workflow) {
			return false;
		}
		if (assertion.workflow && !('workflow' in event)) {
			return false;
		}
		if (assertion.route && !('route' in event)) {
			return false;
		}
		if (assertion.route && 'route' in event && event.route !== assertion.route) {
			return false;
		}
		return event.kind === 'browser-request' || event.kind === 'github-request';
	});
	const browserRequests = events.filter((event) => event.kind === 'browser-request');
	const githubRequests = events.filter((event) => event.kind === 'github-request');
	const totalDurationMs = events.reduce(
		(total, event) => total + ('durationMs' in event ? event.durationMs : 0),
		0
	);

	if (assertion.maxRequests !== undefined && events.length > assertion.maxRequests) {
		throw new Error(`Expected at most ${assertion.maxRequests} requests, got ${events.length}.`);
	}
	if (
		assertion.maxBrowserRequests !== undefined &&
		browserRequests.length > assertion.maxBrowserRequests
	) {
		throw new Error(
			`Expected at most ${assertion.maxBrowserRequests} browser requests, got ${browserRequests.length}.`
		);
	}
	if (
		assertion.maxGitHubRequests !== undefined &&
		githubRequests.length > assertion.maxGitHubRequests
	) {
		throw new Error(
			`Expected at most ${assertion.maxGitHubRequests} GitHub requests, got ${githubRequests.length}.`
		);
	}
	if (assertion.maxDurationMs !== undefined && totalDurationMs > assertion.maxDurationMs) {
		throw new Error(
			`Expected at most ${assertion.maxDurationMs}ms of request duration, got ${Number(
				totalDurationMs.toFixed(1)
			)}ms.`
		);
	}
}
