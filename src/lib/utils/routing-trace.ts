import { browser, dev } from '$app/environment';

const ROUTING_TRACE_STORAGE_KEY = 'tentman:trace-routing';

function isRoutingTraceEnabled(): boolean {
	if (!browser || !dev) {
		return false;
	}

	try {
		return window.localStorage.getItem(ROUTING_TRACE_STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

export function traceRouting(event: string, detail: Record<string, unknown> = {}): void {
	if (!isRoutingTraceEnabled()) {
		return;
	}

	console.info('[tentman:routing]', {
		event,
		timestamp: new Date().toISOString(),
		...detail
	});
}

export const ROUTING_TRACE_FLAG = ROUTING_TRACE_STORAGE_KEY;
