import { browser, dev } from '$app/environment';

export const LAST_ROUTING_FAILURE_KEY = 'tentman:last-routing-failure';

export function writeLastRoutingFailure(detail: Record<string, unknown>): void {
	if (!browser || !dev) {
		return;
	}

	try {
		window.sessionStorage.setItem(
			LAST_ROUTING_FAILURE_KEY,
			JSON.stringify({
				timestamp: new Date().toISOString(),
				...detail
			})
		);
	} catch {
		// Ignore storage failures in diagnostics helpers.
	}
}

export function readLastRoutingFailure(): Record<string, unknown> | null {
	if (!browser || !dev) {
		return null;
	}

	try {
		const value = window.sessionStorage.getItem(LAST_ROUTING_FAILURE_KEY);
		return value ? (JSON.parse(value) as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export function clearLastRoutingFailure(): void {
	if (!browser || !dev) {
		return;
	}

	try {
		window.sessionStorage.removeItem(LAST_ROUTING_FAILURE_KEY);
	} catch {
		// Ignore storage failures in diagnostics helpers.
	}
}
